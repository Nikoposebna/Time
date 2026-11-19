import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  applyCipherChain,
  CipherAlgorithm,
  CipherStep,
  clampChallengeLevel,
  getLevelProfile,
  morseToText,
  normalizeForMorse,
  textToMorse,
} from './src/utils/morseAndCrypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// ============================================================================
// SERVER-AUTHORITATIVE MULTIPLAYER LASER TAG ARENA STATE
// ============================================================================

export type TeamId = 'alpha' | 'omega';

export interface ArenaObstacle {
  id: string;
  x: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

export interface ArenaCombatant {
  id: string;
  name: string;
  team: TeamId;
  isBot: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  health: number;
  shield: number;
  kills: number;
  deaths: number;
  hits: number;
  misses: number;
  alive: boolean;
  respawnAt: number;
  lastBeacon?: string;
}

interface BotBrain {
  id: string;
  targetX: number;
  targetZ: number;
  nextShotAt: number;
  nextTurnAt: number;
}

const ARENA_HALF = 34;

export const ARENA_OBSTACLES: ArenaObstacle[] = [
  // Central citadel tower
  { id: 'center_core', x: 0, z: 0, w: 6, h: 5.5, d: 6 },
  // Inner tactical cover blocks
  { id: 'cover_nw', x: -11, z: -11, w: 4.5, h: 3.2, d: 2.4 },
  { id: 'cover_ne', x: 11, z: -11, w: 4.5, h: 3.2, d: 2.4 },
  { id: 'cover_sw', x: -11, z: 11, w: 4.5, h: 3.2, d: 2.4 },
  { id: 'cover_se', x: 11, z: 11, w: 4.5, h: 3.2, d: 2.4 },
  // Flanking monoliths
  { id: 'flank_w', x: -20, z: 0, w: 3, h: 4.2, d: 9 },
  { id: 'flank_e', x: 20, z: 0, w: 3, h: 4.2, d: 9 },
  { id: 'bridge_n', x: 0, z: -19, w: 10, h: 2.8, d: 2.5 },
  { id: 'bridge_s', x: 0, z: 19, w: 10, h: 2.8, d: 2.5 },
  // Base shields
  { id: 'alpha_shield', x: -24, z: -22, w: 5, h: 3, d: 2 },
  { id: 'omega_shield', x: 24, z: 22, w: 5, h: 3, d: 2 },
];

function isBlockedPosition(x: number, z: number, radius = 0.7): boolean {
  if (Math.abs(x) > ARENA_HALF - radius || Math.abs(z) > ARENA_HALF - radius) {
    return true;
  }
  for (const obs of ARENA_OBSTACLES) {
    const hw = obs.w / 2 + radius;
    const hd = obs.d / 2 + radius;
    if (Math.abs(x - obs.x) < hw && Math.abs(z - obs.z) < hd) {
      return true;
    }
  }
  return false;
}

function getSpawnPoint(team: TeamId): { x: number; z: number; yaw: number } {
  const base = team === 'alpha' ? { x: -27, z: -27, yaw: -Math.PI * 0.75 } : { x: 27, z: 27, yaw: Math.PI * 0.25 };
  for (let attempt = 0; attempt < 15; attempt++) {
    const jx = base.x + (Math.random() - 0.5) * 10;
    const jz = base.z + (Math.random() - 0.5) * 10;
    if (!isBlockedPosition(jx, jz, 1.0)) {
      return { x: jx, z: jz, yaw: base.yaw };
    }
  }
  return base;
}

function rayHitsObstacle(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  maxDist: number
): number {
  let closest = maxDist;
  for (const obs of ARENA_OBSTACLES) {
    const minX = obs.x - obs.w / 2;
    const maxX = obs.x + obs.w / 2;
    const minZ = obs.z - obs.d / 2;
    const maxZ = obs.z + obs.d / 2;

    let tmin = 0;
    let tmax = closest;

    if (Math.abs(dx) < 1e-6) {
      if (ox < minX || ox > maxX) continue;
    } else {
      const tx1 = (minX - ox) / dx;
      const tx2 = (maxX - ox) / dx;
      tmin = Math.max(tmin, Math.min(tx1, tx2));
      tmax = Math.min(tmax, Math.max(tx1, tx2));
    }

    if (Math.abs(dz) < 1e-6) {
      if (oz < minZ || oz > maxZ) continue;
    } else {
      const tz1 = (minZ - oz) / dz;
      const tz2 = (maxZ - oz) / dz;
      tmin = Math.max(tmin, Math.min(tz1, tz2));
      tmax = Math.min(tmax, Math.max(tz1, tz2));
    }

    if (tmax >= tmin && tmin >= 0 && tmin < closest) {
      closest = tmin;
    }
  }
  return closest;
}

const combatants = new Map<string, ArenaCombatant>();
const botBrains = new Map<string, BotBrain>();
const clientSockets = new Map<string, WebSocket>();
const teamScores = { alpha: 0, omega: 0 };

const BOT_CALLSIGNS_ALPHA = [
  'Morze-01',
  'Kripto-Vuk',
  'Soko-7',
  'Signal-A',
  'Vektor-3',
  'Alfa-Talas',
  'Foton-9',
];
const BOT_CALLSIGNS_OMEGA = [
  'Enigma-X',
  'Cezar-4',
  'Omega-Zrak',
  'Šifra-08',
  'Heks-2',
  'Kobra-5',
  'Rotor-6',
  'Spektar-11',
];

function initBots() {
  BOT_CALLSIGNS_ALPHA.forEach((name, idx) => {
    const id = `bot_a_${idx}`;
    const sp = getSpawnPoint('alpha');
    combatants.set(id, {
      id,
      name,
      team: 'alpha',
      isBot: true,
      x: sp.x,
      y: 0,
      z: sp.z,
      yaw: sp.yaw,
      health: 100,
      shield: 50,
      kills: 0,
      deaths: 0,
      hits: 0,
      misses: 0,
      alive: true,
      respawnAt: 0,
    });
    botBrains.set(id, {
      id,
      targetX: (Math.random() - 0.5) * 40,
      targetZ: (Math.random() - 0.5) * 40,
      nextShotAt: Date.now() + 1200 + Math.random() * 2000,
      nextTurnAt: Date.now() + 1500,
    });
  });

  BOT_CALLSIGNS_OMEGA.forEach((name, idx) => {
    const id = `bot_o_${idx}`;
    const sp = getSpawnPoint('omega');
    combatants.set(id, {
      id,
      name,
      team: 'omega',
      isBot: true,
      x: sp.x,
      y: 0,
      z: sp.z,
      yaw: sp.yaw,
      health: 100,
      shield: 50,
      kills: 0,
      deaths: 0,
      hits: 0,
      misses: 0,
      alive: true,
      respawnAt: 0,
    });
    botBrains.set(id, {
      id,
      targetX: (Math.random() - 0.5) * 40,
      targetZ: (Math.random() - 0.5) * 40,
      nextShotAt: Date.now() + 1200 + Math.random() * 2000,
      nextTurnAt: Date.now() + 1500,
    });
  });
}

initBots();

function broadcast(payload: unknown) {
  const msg = JSON.stringify(payload);
  for (const ws of clientSockets.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

function processLaserShot(
  shooter: ArenaCombatant,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number
) {
  const horizLen = Math.hypot(dx, dz) || 1;
  const maxObsDist = rayHitsObstacle(ox, oz, dx / horizLen, dz / horizLen, 65);

  let hitTarget: ArenaCombatant | null = null;
  let hitDist = maxObsDist;

  for (const target of combatants.values()) {
    if (target.id === shooter.id || !target.alive || target.team === shooter.team) continue;

    // 3D ray-cylinder intersection test against combatant torso
    const tx = target.x - ox;
    const ty = target.y + 1.0 - oy;
    const tz = target.z - oz;
    const proj = tx * dx + ty * dy + tz * dz;
    if (proj <= 0 || proj >= hitDist) continue;

    const closestX = ox + dx * proj;
    const closestY = oy + dy * proj;
    const closestZ = oz + dz * proj;

    const radialDist = Math.hypot(closestX - target.x, closestZ - target.z);
    const verticalOffset = Math.abs(closestY - (target.y + 1.0));

    if (radialDist <= 0.72 && verticalOffset <= 1.15) {
      hitTarget = target;
      hitDist = proj;
    }
  }

  const endX = ox + dx * hitDist;
  const endY = oy + dy * hitDist;
  const endZ = oz + dz * hitDist;

  broadcast({
    type: 'arena:laser',
    shooterId: shooter.id,
    team: shooter.team,
    from: [ox, oy, oz],
    to: [endX, endY, endZ],
    hitId: hitTarget?.id ?? null,
  });

  if (hitTarget) {
    shooter.hits += 1;
    const damage = 34;
    if (hitTarget.shield > 0) {
      const absorbed = Math.min(hitTarget.shield, damage);
      hitTarget.shield -= absorbed;
      const rem = damage - absorbed;
      hitTarget.health -= rem;
    } else {
      hitTarget.health -= damage;
    }

    if (hitTarget.health <= 0) {
      hitTarget.health = 0;
      hitTarget.alive = false;
      hitTarget.deaths += 1;
      hitTarget.respawnAt = Date.now() + 3000;
      shooter.kills += 1;
      teamScores[shooter.team] += 1;

      broadcast({
        type: 'arena:kill',
        killerId: shooter.id,
        killerName: shooter.name,
        killerTeam: shooter.team,
        victimId: hitTarget.id,
        victimName: hitTarget.name,
        victimTeam: hitTarget.team,
        teamScores,
      });
    }
  } else {
    shooter.misses += 1;
  }
}

// Server tick loop (20 Hz)
setInterval(() => {
  const now = Date.now();
  const dt = 0.05;

  for (const c of combatants.values()) {
    if (!c.alive && now >= c.respawnAt) {
      const sp = getSpawnPoint(c.team);
      c.x = sp.x;
      c.z = sp.z;
      c.y = 0;
      c.yaw = sp.yaw;
      c.health = 100;
      c.shield = 50;
      c.alive = true;
    }

    if (!c.isBot || !c.alive) continue;
    const brain = botBrains.get(c.id);
    if (!brain) continue;

    // Pick new waypoint periodically or when reached
    const distToGoal = Math.hypot(brain.targetX - c.x, brain.targetZ - c.z);
    if (distToGoal < 2.2 || now >= brain.nextTurnAt) {
      brain.targetX = (Math.random() - 0.5) * 52;
      brain.targetZ = (Math.random() - 0.5) * 52;
      brain.nextTurnAt = now + 2200 + Math.random() * 2500;
    }

    // Move toward waypoint
    const moveAngle = Math.atan2(brain.targetX - c.x, brain.targetZ - c.z);
    const speed = 5.4;
    const nx = c.x + Math.sin(moveAngle) * speed * dt;
    const nz = c.z + Math.cos(moveAngle) * speed * dt;

    if (!isBlockedPosition(nx, nz, 0.75)) {
      c.x = nx;
      c.z = nz;
    } else {
      brain.targetX = (Math.random() - 0.5) * 48;
      brain.targetZ = (Math.random() - 0.5) * 48;
    }

    // Find nearest visible enemy for aiming & firing
    let nearestEnemy: ArenaCombatant | null = null;
    let nearestDist = 26;
    for (const other of combatants.values()) {
      if (!other.alive || other.team === c.team) continue;
      const d = Math.hypot(other.x - c.x, other.z - c.z);
      if (d < nearestDist) {
        const obsDist = rayHitsObstacle(
          c.x,
          c.z,
          (other.x - c.x) / (d || 1),
          (other.z - c.z) / (d || 1),
          d
        );
        if (obsDist >= d - 0.5) {
          nearestEnemy = other;
          nearestDist = d;
        }
      }
    }

    if (nearestEnemy) {
      c.yaw = Math.atan2(nearestEnemy.x - c.x, nearestEnemy.z - c.z);
      if (now >= brain.nextShotAt) {
        brain.nextShotAt = now + 950 + Math.random() * 1100;
        const spread = (Math.random() - 0.5) * 0.12;
        const dx = Math.sin(c.yaw + spread);
        const dz = Math.cos(c.yaw + spread);
        processLaserShot(c, c.x, 1.35, c.z, dx, 0, dz);
      }
    } else {
      c.yaw = moveAngle;
    }
  }

  if (clientSockets.size > 0) {
    // Occasionally let an alive bot broadcast an encrypted Morse tactical callout
    if (Math.random() < 0.015) {
      const aliveBots = Array.from(combatants.values()).filter((c) => c.isBot && c.alive);
      if (aliveBots.length > 0) {
        const sender = aliveBots[Math.floor(Math.random() * aliveBots.length)];
        const samples = [
          { cipherText: 'SOS SEKTOR 4', morse: '... --- ... / ... . -.- - --- .-. / ....-', cipherType: 'MORSE', beaconType: 'sos' },
          { cipherText: 'HSMA ZLRAVY', morse: '.... ... -- .- / --.. .-.. .-. .- ...- -.--', cipherType: 'CAESAR +7', beaconType: 'tactical' },
          { cipherText: 'ZUVOV NYBW', morse: '--.. ..- ...- --- ...- / -. -.-- -... .--', cipherType: 'ATBASH', beaconType: 'distraction' },
          { cipherText: 'KOD SOKO', morse: '-.- --- -.. / ... --- -.- ---', cipherType: 'MORSE', beaconType: 'tactical' },
          { cipherText: 'MAMAC X9', morse: '-- .- -- .- -.-. / -..- ----.', cipherType: 'DECOY', beaconType: 'distraction' },
          { cipherText: 'HITNO ALFA', morse: '.... .. - -. --- / .- .-.. ..-. .-', cipherType: 'SOS', beaconType: 'sos' },
        ];
        const pick = samples[Math.floor(Math.random() * samples.length)];
        sender.lastBeacon = pick.morse;
        broadcast({
          type: 'arena:morse_beacon',
          playerId: sender.id,
          playerName: sender.name,
          team: sender.team,
          morse: pick.morse,
          cipherText: pick.cipherText,
          cipherType: pick.cipherType,
          beaconType: pick.beaconType,
          plaintext: pick.cipherText,
        });
      }
    }

    broadcast({
      type: 'arena:state',
      teamScores,
      combatants: Array.from(combatants.values()),
    });
  }
}, 50);

// ============================================================================
// EXPRESS + VITE + WEBSOCKET SERVER BOOTSTRAP
// ============================================================================

function resolveGeminiLanguage(language: string): string {
  switch (language) {
    case 'en':
      return 'English';
    case 'ru':
      return 'Russian (русский)';
    case 'zh':
      return 'Simplified Chinese (简体中文)';
    case 'es':
      return 'Spanish (español)';
    case 'de':
      return 'German (Deutsch)';
    case 'ja':
      return 'Japanese (日本語)';
    default:
      return 'Serbian (srpski, latinica)';
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, playersOnline: combatants.size });
  });

  // Gemini AI: Cryptanalysis & Morse/Cipher Auto-Decoder
  app.post('/api/ai/analyze', async (req, res) => {
    try {
      const { input, language = 'sr', hint = '' } = req.body ?? {};
      if (!input || typeof input !== 'string' || !input.trim()) {
        return res.status(400).json({ error: 'Unesite tekst, Morzeov kod ili šifrat za analizu.' });
      }

      const ai = getGeminiClient();
      if (!ai) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY nije podešen. Proverite Settings > Secrets panel.',
        });
      }

      const langLabel = resolveGeminiLanguage(language);

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Analyze and decode the following cryptographic / Morse transmission.\n\nTransmission:\n"""\n${input.trim()}\n"""\n\nOptional operator hint: ${hint || 'none'}`,
        config: {
          systemInstruction: `You are an elite cryptanalyst and Morse code signals intelligence expert.
Your job is to inspect any user input (International Morse code with dots/dashes, Caesar cipher, Vigenere cipher, Atbash, Rail Fence, XOR hex, Base64, Binary, or layered cipher+Morse combinations).
Respond strictly in ${langLabel}.
Always return valid JSON matching the schema. Be accurate: if the input is Morse, decode it first and check if the decoded output is itself encrypted with a classical cipher! Explain each deduction step clearly and concisely.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedFormat: {
                type: Type.STRING,
                description: 'Detected encoding/cipher stack (e.g. "Morse -> Caesar (+7)" or "Vigenere + Base64").',
              },
              decodedPlaintext: {
                type: Type.STRING,
                description: 'Final recovered plaintext message.',
              },
              morseRepresentation: {
                type: Type.STRING,
                description: 'Equivalent International Morse code of the plaintext.',
              },
              confidencePercent: {
                type: Type.INTEGER,
                description: 'Confidence from 0 to 100.',
              },
              analysisSteps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 to 5 concise step-by-step cryptanalysis deductions.',
              },
              securityNote: {
                type: Type.STRING,
                description: 'Brief cryptographic strength or vulnerability assessment.',
              },
            },
            required: [
              'detectedFormat',
              'decodedPlaintext',
              'morseRepresentation',
              'confidencePercent',
              'analysisSteps',
              'securityNote',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json(parsed);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Greška pri AI analizi.';
      return res.status(500).json({ error: message });
    }
  });

  // Gemini AI: Generate Cryptographic + Morse Mission Challenge (Levels 1-99)
  app.post('/api/ai/challenge', async (req, res) => {
    try {
      const { level: rawLevel, difficulty = 'medium', language = 'sr' } = req.body ?? {};
      const legacyMap: Record<string, number> = { easy: 10, medium: 35, hard: 75 };
      const numericLevel =
        typeof rawLevel === 'number' || (typeof rawLevel === 'string' && rawLevel.trim() !== '')
          ? clampChallengeLevel(Number(rawLevel))
          : legacyMap[String(difficulty)] ?? 1;
      const profile = getLevelProfile(numericLevel);

      const ai = getGeminiClient();
      if (!ai) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY nije podešen. Proverite Settings > Secrets panel.',
        });
      }

      const langLabel = resolveGeminiLanguage(language);

      const allowedSinglePool: CipherAlgorithm[] =
        numericLevel <= 15
          ? ['caesar', 'atbash']
          : numericLevel <= 35
          ? ['caesar', 'railfence', 'vigenere']
          : numericLevel <= 55
          ? ['caesar', 'vigenere', 'railfence', 'atbash']
          : ['caesar', 'vigenere', 'atbash', 'railfence', 'xor_hex'];

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Generate a brand new tactical cryptography & Morse code capability test puzzle for Level ${profile.level}/99 (Tier ${profile.tier}: ${profile.tierKey.toUpperCase()}, ${profile.layerCount} encryption layer(s)).`,
        config: {
          systemInstruction: `You are a master cryptography assessment designer running a 99-level signal-intelligence exam.
Generate a realistic tactical radio / cyber-signal puzzle in ${langLabel} calibrated strictly to Level ${profile.level} of 99:
- Tier: ${profile.tierKey.toUpperCase()} (${profile.layerCount} chained encryption layers)
- Plaintext length: ${profile.minWords} to ${profile.maxWords} short uppercase ASCII A-Z tokens${profile.includeDigits ? ' including 1-2 numeric sector/unit codes (0-9)' : ' (letters only)'}. Do NOT use diacritics (use plain ASCII A-Z).
- Suggest exactly ${profile.layerCount} chained cipher steps chosen from: ${allowedSinglePool.join(', ')}.
  - For caesar: numeric shift string (${numericLevel <= 15 ? '2-9' : '11-24'}).
  - For vigenere: uppercase ASCII keyword (${numericLevel <= 35 ? '4-5' : numericLevel <= 75 ? '6-7' : '8-10'} letters).
  - For railfence: numeric rails string (${numericLevel <= 45 ? '3-4' : numericLevel <= 75 ? '4-6' : '6-8'}).
  - For xor_hex (only allowed as the FINAL step when layerCount >= 3): alphanumeric uppercase key (4-6 chars).
  - For atbash: empty string "".
- Write title, briefing, and a clever cryptanalyst hint in ${langLabel}. For higher levels (50+), the hint should guide deduction without giving away the answer directly.
Return valid JSON matching the schema.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              briefing: { type: Type.STRING },
              plaintext: { type: Type.STRING },
              cipherSteps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    algorithm: { type: Type.STRING },
                    key: { type: Type.STRING },
                  },
                  required: ['algorithm', 'key'],
                },
              },
              hint: { type: Type.STRING },
            },
            required: ['title', 'briefing', 'plaintext', 'cipherSteps', 'hint'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        title?: string;
        briefing?: string;
        plaintext?: string;
        cipherSteps?: { algorithm?: string; key?: string }[];
        hint?: string;
      };

      const sanitizeKey = (alg: CipherAlgorithm, rawKey: string, stepIdx: number): string => {
        const clean = normalizeForMorse(String(rawKey || '')).replace(/[^A-Z0-9]/g, '');
        if (alg === 'atbash') return '';
        if (alg === 'caesar') {
          const n = parseInt(clean, 10);
          const minShift = numericLevel <= 15 ? 2 : 9;
          const shift = Number.isFinite(n) && n >= 1 && n <= 25 ? n : minShift + ((numericLevel + stepIdx * 5) % 15);
          return String(shift);
        }
        if (alg === 'railfence') {
          const r = parseInt(clean, 10);
          const maxR = numericLevel <= 45 ? 4 : numericLevel <= 75 ? 6 : 8;
          const rails = Number.isFinite(r) && r >= 2 && r <= maxR ? r : Math.min(maxR, 3 + Math.floor(numericLevel / 25));
          return String(rails);
        }
        if (alg === 'xor_hex') {
          const k = clean.slice(0, 6);
          return k.length >= 3 ? k : `K${numericLevel}X`;
        }
        // vigenere
        const lettersOnly = clean.replace(/[^A-Z]/g, '');
        const fallbackKeys = ['SOLARIS', 'KRYPTON', 'HYPERION', 'VALKYRIE', 'OBSIDIAN', 'CHRONOS', 'OMEGAKEY'];
        const fb = fallbackKeys[(numericLevel + stepIdx) % fallbackKeys.length];
        return lettersOnly.length >= 4 ? lettersOnly.slice(0, 10) : fb;
      };

      const validAlgs: CipherAlgorithm[] = ['caesar', 'vigenere', 'atbash', 'railfence', 'xor_hex'];
      let steps: CipherStep[] = Array.isArray(parsed.cipherSteps)
        ? parsed.cipherSteps
            .filter((s): s is { algorithm: CipherAlgorithm; key?: string } =>
              validAlgs.includes(s?.algorithm as CipherAlgorithm)
            )
            .slice(0, profile.layerCount)
            .map((s, idx) => ({
              algorithm: s.algorithm,
              key: sanitizeKey(s.algorithm, String(s.key ?? ''), idx),
            }))
        : [];

      // Keep xor_hex strictly as the final outermost layer if present
      const nonXorSteps = steps.filter((s) => s.algorithm !== 'xor_hex');
      const xorStep = steps.find((s) => s.algorithm === 'xor_hex');
      steps = xorStep && profile.layerCount >= 3 ? [...nonXorSteps, xorStep] : nonXorSteps;

      // Deterministically guarantee exact layerCount for the requested level 1..99
      const escalationCycle: CipherAlgorithm[] =
        numericLevel <= 15
          ? ['caesar', 'atbash']
          : numericLevel <= 35
          ? ['vigenere', 'caesar', 'railfence']
          : numericLevel <= 65
          ? ['caesar', 'vigenere', 'railfence', 'atbash']
          : ['atbash', 'caesar', 'vigenere', 'railfence'];

      let padIdx = 0;
      while (steps.length < profile.layerCount) {
        const candidate = escalationCycle[(numericLevel + steps.length + padIdx) % escalationCycle.length];
        padIdx++;
        if (steps.length > 0 && steps[steps.length - 1].algorithm === candidate && padIdx < 6) {
          continue;
        }
        const xorIdx = steps.findIndex((s) => s.algorithm === 'xor_hex');
        const nextStep: CipherStep = {
          algorithm: candidate,
          key: sanitizeKey(candidate, '', steps.length),
        };
        if (xorIdx >= 0) {
          steps.splice(xorIdx, 0, nextStep);
        } else {
          steps.push(nextStep);
        }
      }
      steps = steps.slice(0, profile.layerCount);

      // Build clean Morse-safe uppercase ASCII plaintext
      let plaintext = normalizeForMorse(String(parsed.plaintext || 'SECTOR ALFA CLEAR'))
        .replace(/[^A-Z0-9\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!plaintext) plaintext = `SECTOR ${profile.level} ACTIVE`;

      // If railfence is present without an outer xor_hex wrapper, join words with '-' so Morse preserves exact length
      const hasRail = steps.some((s) => s.algorithm === 'railfence');
      const endsWithXor = steps[steps.length - 1]?.algorithm === 'xor_hex';
      if (hasRail && !endsWithXor) {
        plaintext = plaintext.replace(/\s+/g, '-');
      }

      // Verify exact roundtrip through applyCipherChain -> textToMorse -> morseToText -> decrypt
      const ciphered = applyCipherChain(plaintext, steps, 'encrypt');
      const morseCheck = morseToText(textToMorse(ciphered));
      if (morseCheck !== ciphered) {
        plaintext = plaintext.replace(/\s+/g, '-');
      }

      const cipherType = steps.map((s) => s.algorithm).join(' → ');
      const cipherKey = steps.map((s) => (s.algorithm === 'atbash' ? 'MIRROR' : s.key)).join(' | ');

      return res.json({
        level: profile.level,
        tier: profile.tier,
        tierKey: profile.tierKey,
        wpm: profile.wpm,
        xpReward: profile.xpReward,
        title: parsed.title || `Mission LVL-${profile.level}`,
        briefing: parsed.briefing || '',
        plaintext,
        cipherSteps: steps,
        cipherType,
        cipherKey,
        hint: parsed.hint || '',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Greška pri generisanju AI misije.';
      return res.status(500).json({ error: message });
    }
  });

  // Gemini AI: Smart Tactical Cipher + Morse Composer
  app.post('/api/ai/compose', async (req, res) => {
    try {
      const { topic, cipherPreference = 'vigenere', language = 'sr' } = req.body ?? {};
      if (!topic || typeof topic !== 'string' || !topic.trim()) {
        return res.status(400).json({ error: 'Unesite temu ili poruku za AI kodiranje.' });
      }

      const ai = getGeminiClient();
      if (!ai) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY nije podešen. Proverite Settings > Secrets panel.',
        });
      }

      const langLabel = resolveGeminiLanguage(language);

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Create a concise tactical radio transmission based on: "${topic.trim()}". Preferred cipher: ${cipherPreference}.`,
        config: {
          systemInstruction: `You are a tactical signals officer.
Write a crisp 4 to 8 word uppercase ASCII A-Z message in ${langLabel} (using plain Latin letters without Č/Ć/Š/Ž/Đ diacritics so it encodes cleanly into International Morse), suggest a strong thematic keyword, and explain the recommended transmission protocol briefly.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tacticalMessage: { type: Type.STRING },
              recommendedKey: { type: Type.STRING },
              protocolNote: { type: Type.STRING },
            },
            required: ['tacticalMessage', 'recommendedKey', 'protocolNote'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json(parsed);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Greška pri AI sastavljanju poruke.';
      return res.status(500).json({ error: message });
    }
  });

  // Vite middleware in development, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const playerId = `plr_${Math.random().toString(36).slice(2, 9)}`;
    const initialTeam: TeamId = teamScores.alpha <= teamScores.omega ? 'alpha' : 'omega';
    const spawn = getSpawnPoint(initialTeam);

    const player: ArenaCombatant = {
      id: playerId,
      name: `Operativac-${playerId.slice(-3).toUpperCase()}`,
      team: initialTeam,
      isBot: false,
      x: spawn.x,
      y: 0,
      z: spawn.z,
      yaw: spawn.yaw,
      health: 100,
      shield: 50,
      kills: 0,
      deaths: 0,
      hits: 0,
      misses: 0,
      alive: true,
      respawnAt: 0,
    };

    combatants.set(playerId, player);
    clientSockets.set(playerId, ws);

    ws.send(
      JSON.stringify({
        type: 'arena:init',
        selfId: playerId,
        obstacles: ARENA_OBSTACLES,
        teamScores,
        combatants: Array.from(combatants.values()),
      })
    );

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const self = combatants.get(playerId);
        if (!self) return;

        if (msg.type === 'player:join' && typeof msg.name === 'string') {
          self.name = msg.name.trim().slice(0, 18) || self.name;
          if (msg.team === 'alpha' || msg.team === 'omega') {
            self.team = msg.team;
            const sp = getSpawnPoint(self.team);
            self.x = sp.x;
            self.z = sp.z;
            self.yaw = sp.yaw;
          }
        } else if (msg.type === 'player:move' && self.alive) {
          const nx = Number(msg.x);
          const ny = Number(msg.y);
          const nz = Number(msg.z);
          const nyaw = Number(msg.yaw);
          if (Number.isFinite(nx) && Number.isFinite(nz) && !isBlockedPosition(nx, nz, 0.55)) {
            self.x = nx;
            self.z = nz;
          }
          if (Number.isFinite(ny)) {
            self.y = Math.max(0, Math.min(4, ny));
          }
          if (Number.isFinite(nyaw)) {
            self.yaw = nyaw;
          }
        } else if (msg.type === 'player:shoot' && self.alive) {
          const ox = Number(msg.ox ?? self.x);
          const oy = Number(msg.oy ?? self.y + 1.45);
          const oz = Number(msg.oz ?? self.z);
          const dx = Number(msg.dx ?? 0);
          const dy = Number(msg.dy ?? 0);
          const dz = Number(msg.dz ?? -1);
          const len = Math.hypot(dx, dy, dz) || 1;
          processLaserShot(self, ox, oy, oz, dx / len, dy / len, dz / len);
        } else if (msg.type === 'player:morse_beacon' && typeof msg.morse === 'string') {
          self.lastBeacon = msg.morse.slice(0, 80);
          const cipherText = typeof msg.cipherText === 'string' ? msg.cipherText.slice(0, 48) : '';
          const cipherType = typeof msg.cipherType === 'string' ? msg.cipherType.slice(0, 20) : 'MORSE';
          const beaconType =
            msg.beaconType === 'sos' || msg.beaconType === 'tactical' || msg.beaconType === 'distraction'
              ? msg.beaconType
              : 'tactical';
          broadcast({
            type: 'arena:morse_beacon',
            playerId: self.id,
            playerName: self.name,
            team: self.team,
            morse: self.lastBeacon,
            cipherText,
            cipherType,
            beaconType,
            plaintext: typeof msg.plaintext === 'string' ? msg.plaintext.slice(0, 48) : '',
          });
        } else if (msg.type === 'player:switch_team') {
          self.team = self.team === 'alpha' ? 'omega' : 'alpha';
          const sp = getSpawnPoint(self.team);
          self.x = sp.x;
          self.z = sp.z;
          self.y = 0;
          self.yaw = sp.yaw;
          self.health = 100;
          self.shield = 50;
          self.alive = true;
        }
      } catch {
        // ignore malformed packets
      }
    });

    ws.on('close', () => {
      combatants.delete(playerId);
      clientSockets.delete(playerId);
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`MorzeKripto server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
