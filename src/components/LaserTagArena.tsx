import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Crosshair, Radio, RefreshCw, Shield, EyeOff, Eye, Users, Send, Mic, MicOff, ZoomIn, ZoomOut, RotateCcw, LocateFixed } from 'lucide-react';
import { audioEngine } from '../utils/audioEngine';
import { applyCipher, textToMorse } from '../utils/morseAndCrypto';
import { AppLanguage, UI_TRANSLATIONS } from '../i18n/translations';

type TeamId = 'alpha' | 'omega';

interface ArenaObstacle {
  id: string;
  x: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

interface ArenaCombatant {
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
  lastBeacon?: string;
}

interface KillFeedEntry {
  id: string;
  killerName: string;
  killerTeam: TeamId;
  victimName: string;
  victimTeam: TeamId;
}

interface BeaconFeedEntry {
  id: string;
  playerId: string;
  playerName: string;
  team: TeamId;
  morse: string;
  cipherText: string;
  cipherType: string;
  plaintext: string;
}

type ArenaCipherMode = 'none' | 'caesar' | 'vigenere' | 'atbash';
type BeaconCategory = 'sos' | 'tactical' | 'distraction';
type MinimapBeaconFilter = 'all' | BeaconCategory;
type MinimapPlayerLabelMode = 'off' | 'id' | 'team';

function formatCompactPlayerId(combatant: ArenaCombatant): string {
  if (combatant.id.startsWith('bot_a_')) return `A-${combatant.id.slice(6)}`;
  if (combatant.id.startsWith('bot_o_')) return `O-${combatant.id.slice(6)}`;
  if (combatant.id.startsWith('plr_')) return `P-${combatant.id.slice(-3).toUpperCase()}`;
  return combatant.id.slice(0, 5).toUpperCase();
}

function classifyBeaconCategory(text: string, explicit?: string): BeaconCategory {
  if (explicit === 'sos' || explicit === 'tactical' || explicit === 'distraction') {
    return explicit;
  }
  const upper = text.toUpperCase();
  if (/\b(SOS|HITNO|POMOC|MAYDAY|URGENT)\b/.test(upper)) return 'sos';
  if (/\b(MAMAC|LAZNI|DECOY|DISTRAKCIJA|DISTRAK|DIVERSION|FAKE)\b/.test(upper)) return 'distraction';
  return 'tactical';
}

function formatGridCoord(value: number): string {
  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(1)}`;
}

function getSectorCode(x: number, y: number): string {
  const cols = ['A', 'B', 'C', 'D'];
  const colIdx = Math.max(0, Math.min(3, Math.floor((x + 36) / 18)));
  const rowIdx = Math.max(1, Math.min(4, Math.floor((y + 36) / 18) + 1));
  return `${cols[colIdx]}${rowIdx}`;
}

function getCardinalLabel(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

interface FloatingBeaconData {
  playerId: string;
  playerName: string;
  team: TeamId;
  morse: string;
  cipherText: string;
  cipherType: string;
  expiresAt: number;
  phase: number;
}

interface LaserTagArenaProps {
  lang: AppLanguage;
  pendingMorseBeacon: { plaintext: string; morse: string; autoSendId?: number } | null;
  voiceBeaconSignal?: number;
  voiceEncryptSignal?: number;
  voiceListening?: boolean;
  voiceSupported?: boolean;
  onToggleVoice?: () => void;
}

// Reusable math objects outside animation loop (zero per-frame GC)
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveVec = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _beamUp = new THREE.Vector3(0, 1, 0);
const _beamQuat = new THREE.Quaternion();
const _beamMid = new THREE.Vector3();

function createArenaFloorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0c1220';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle metallic tile border
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 508, 508);

  // Fine tactical sub-grid
  ctx.strokeStyle = 'rgba(6, 182, 212, 0.14)';
  ctx.lineWidth = 1.5;
  for (let i = 64; i < 512; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Composite 7-part cyber combatant rig pivoted at bottom-center (y = 0)
function createCombatantRig(team: TeamId): THREE.Group {
  const group = new THREE.Group();
  const accentHex = team === 'alpha' ? 0x06b6d4 : 0xf59e0b;

  const armorMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.42,
    metalness: 0.72,
  });
  const darkJointMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.75,
    metalness: 0.25,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 1.6,
    roughness: 0.2,
    metalness: 0.1,
  });

  // 1 & 2. Grounded boots/legs (y = 0..0.75)
  const legGeo = new THREE.BoxGeometry(0.24, 0.75, 0.26);
  const leftLeg = new THREE.Mesh(legGeo, darkJointMat);
  leftLeg.position.set(-0.17, 0.375, 0);
  const rightLeg = new THREE.Mesh(legGeo, darkJointMat);
  rightLeg.position.set(0.17, 0.375, 0);
  group.add(leftLeg, rightLeg);

  // 3. Armored chest torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.72, 0.36), armorMat);
  torso.position.set(0, 1.11, 0);
  group.add(torso);

  // 4. Glowing team energy core
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.26, 0.39), glowMat);
  core.position.set(0, 1.16, 0);
  group.add(core);

  // 5. Shoulder pauldrons
  const pauldronGeo = new THREE.BoxGeometry(0.22, 0.2, 0.38);
  const leftPauldron = new THREE.Mesh(pauldronGeo, armorMat);
  leftPauldron.position.set(-0.42, 1.38, 0);
  const rightPauldron = new THREE.Mesh(pauldronGeo, armorMat);
  rightPauldron.position.set(0.42, 1.38, 0);
  group.add(leftPauldron, rightPauldron);

  // 6. Tactical helmet + glowing visor
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.36, 0.38), armorMat);
  helmet.position.set(0, 1.68, 0);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.08), glowMat);
  visor.position.set(0, 1.7, 0.18);
  group.add(helmet, visor);

  // 7. Laser carbine
  const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.78), darkJointMat);
  rifle.position.set(0.32, 1.15, 0.35);
  const rifleEmitter = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.22), glowMat);
  rifleEmitter.position.set(0.32, 1.18, 0.68);
  group.add(rifle, rifleEmitter);

  return group;
}

// Composite 5-part First-Person Viewmodel Laser Carbine
function createFirstPersonRifle(team: TeamId): THREE.Group {
  const group = new THREE.Group();
  const accentHex = team === 'alpha' ? 0x06b6d4 : 0xf59e0b;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.38,
    metalness: 0.8,
  });
  const gripMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.78,
    metalness: 0.2,
  });
  const coreMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 1.8,
    roughness: 0.2,
    metalness: 0.1,
  });

  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.48), bodyMat);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.34, 12), gripMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.35);

  const energyTube = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.03, 0.32), coreMat);
  energyTube.position.set(0, 0.062, -0.1);

  const sightFrame = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.045, 0.06), bodyMat);
  sightFrame.position.set(0, 0.085, 0.05);

  const muzzleRing = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.03, 12), coreMat);
  muzzleRing.rotation.x = Math.PI / 2;
  muzzleRing.position.set(0, 0.02, -0.52);

  group.add(receiver, barrel, energyTube, sightFrame, muzzleRing);
  group.position.set(0.24, -0.22, -0.38);
  return group;
}

// Create 3D fluttering encrypted Morse text sprite above an avatar
function createFloatingMorseSprite(
  playerName: string,
  team: TeamId,
  cipherType: string,
  cipherText: string,
  morse: string
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 176;
  const ctx = canvas.getContext('2d')!;

  const accent = team === 'alpha' ? '#22d3ee' : '#fbbf24';
  const border = team === 'alpha' ? 'rgba(34, 211, 238, 0.75)' : 'rgba(251, 191, 36, 0.75)';

  ctx.clearRect(0, 0, 512, 176);

  // Dark translucent plate with crisp team border
  ctx.fillStyle = 'rgba(10, 14, 23, 0.88)';
  ctx.beginPath();
  ctx.roundRect(8, 8, 496, 152, 16);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = border;
  ctx.stroke();

  // Header: callsign + cipher tag
  ctx.fillStyle = accent;
  ctx.font = '600 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`${playerName}  ·  ${cipherType}`, 26, 44);

  // Encrypted ciphertext line
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 26px "JetBrains Mono", monospace';
  const clippedCipher = (cipherText || 'SOS').slice(0, 26);
  ctx.fillText(clippedCipher, 26, 86);

  // Morse dots & dashes line
  ctx.fillStyle = '#fcd34d';
  ctx.font = '600 22px "JetBrains Mono", monospace';
  const clippedMorse = (morse || '... --- ...').slice(0, 32);
  ctx.fillText(clippedMorse, 26, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.9, 1.0, 1);
  sprite.position.set(0, 2.45, 0);
  return sprite;
}

export const LaserTagArena: React.FC<LaserTagArenaProps> = ({
  lang,
  pendingMorseBeacon,
  voiceBeaconSignal = 0,
  voiceEncryptSignal = 0,
  voiceListening = false,
  voiceSupported = true,
  onToggleVoice,
}) => {
  const t = UI_TRANSLATIONS[lang].arena;
  const langRef = useRef<AppLanguage>(lang);
  langRef.current = lang;

  const mountRef = useRef<HTMLDivElement | null>(null);
  const radarCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [connected, setConnected] = useState<boolean>(false);
  const [pointerLocked, setPointerLocked] = useState<boolean>(false);
  const [hudCollapsed, setHudCollapsed] = useState<boolean>(false);
  const [callsign, setCallsign] = useState<string>('Operativac');
  const [teamScores, setTeamScores] = useState<{ alpha: number; omega: number }>({ alpha: 0, omega: 0 });
  const [selfStats, setSelfStats] = useState<{
    id: string;
    team: TeamId;
    health: number;
    shield: number;
    kills: number;
    deaths: number;
    hits: number;
    misses: number;
    alive: boolean;
  }>({
    id: '',
    team: 'alpha',
    health: 100,
    shield: 50,
    kills: 0,
    deaths: 0,
    hits: 0,
    misses: 0,
    alive: true,
  });
  const [combatantCount, setCombatantCount] = useState<number>(16);
  const [hitMarkerAt, setHitMarkerAt] = useState<number>(0);
  const [killFeed, setKillFeed] = useState<KillFeedEntry[]>([]);
  const [beaconFeed, setBeaconFeed] = useState<BeaconFeedEntry[]>([]);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [beaconDraft, setBeaconDraft] = useState<string>(pendingMorseBeacon?.plaintext || 'ALFA NAPAD');
  const [arenaCipher, setArenaCipher] = useState<ArenaCipherMode>('caesar');
  const [beaconCategory, setBeaconCategory] = useState<BeaconCategory>('tactical');
  const [minimapFilter, setMinimapFilter] = useState<MinimapBeaconFilter>('all');
  const [minimapLabelMode, setMinimapLabelMode] = useState<MinimapPlayerLabelMode>('team');
  const [minimapZoom, setMinimapZoom] = useState<number>(1);
  const [autoCenter, setAutoCenter] = useState<boolean>(true);
  const [isPanningMap, setIsPanningMap] = useState<boolean>(false);
  const [exploredPct, setExploredPct] = useState<number>(0);
  const [headingDeg, setHeadingDeg] = useState<number>(135);
  const [minimapCoords, setMinimapCoords] = useState<{
    centerX: number;
    centerY: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    cursorX: number | null;
    cursorY: number | null;
  }>({
    centerX: 0,
    centerY: 0,
    minX: -36,
    maxX: 36,
    minY: -36,
    maxY: 36,
    cursorX: null,
    cursorY: null,
  });
  const [selfFlutterEcho, setSelfFlutterEcho] = useState<{
    cipherText: string;
    morse: string;
    cipherType: string;
  } | null>(null);

  const selfIdRef = useRef<string>('');
  const obstaclesRef = useRef<ArenaObstacle[]>([]);
  const combatantsRef = useRef<Map<string, ArenaCombatant>>(new Map());
  const pendingBeaconsRef = useRef<FloatingBeaconData[]>([]);
  const minimapBeaconsRef = useRef<
    { x: number; z: number; team: TeamId; beaconType: BeaconCategory; expiresAt: number }[]
  >([]);
  const minimapFilterRef = useRef<MinimapBeaconFilter>('all');
  minimapFilterRef.current = minimapFilter;
  const minimapLabelModeRef = useRef<MinimapPlayerLabelMode>('team');
  minimapLabelModeRef.current = minimapLabelMode;
  const minimapZoomRef = useRef<number>(1);
  minimapZoomRef.current = minimapZoom;
  const autoCenterRef = useRef<boolean>(true);
  autoCenterRef.current = autoCenter;
  const freeCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const radarWrapperRef = useRef<HTMLDivElement | null>(null);
  const hoverGridRef = useRef<{ x: number; y: number } | null>(null);
  const lastCoordsKeyRef = useRef<string>('');
  const lastHeadingRef = useRef<number>(135);
  const dragStateRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    startCenterX: number;
    startCenterY: number;
  } | null>(null);
  const localPlayerRef = useRef({
    x: -26,
    y: 0,
    z: -26,
    vy: 0,
    yaw: -Math.PI * 0.75,
    pitch: 0,
    recoil: 0,
    dashCooldown: 0,
    grounded: true,
  });

  // Track active beams spawned from server events
  const activeBeamsRef = useRef<
    {
      from: [number, number, number];
      to: [number, number, number];
      team: TeamId;
      expiresAt: number;
      created: boolean;
    }[]
  >([]);

  const broadcastMorseBeacon = (customPlain?: string, customMorse?: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const rawPlain = (customPlain || beaconDraft || pendingMorseBeacon?.plaintext || 'SOS ALFA').trim();
    let cipherText = rawPlain.toUpperCase();
    let cipherLabel = 'MORSE';

    if (!customMorse && arenaCipher !== 'none') {
      if (arenaCipher === 'caesar') {
        cipherText = applyCipher(rawPlain, 'caesar', 'encrypt', '7');
        cipherLabel = 'CAESAR +7';
      } else if (arenaCipher === 'vigenere') {
        cipherText = applyCipher(rawPlain, 'vigenere', 'encrypt', 'SOLARIS');
        cipherLabel = 'VIGENERE';
      } else if (arenaCipher === 'atbash') {
        cipherText = applyCipher(rawPlain, 'atbash', 'encrypt', '');
        cipherLabel = 'ATBASH';
      }
    }

    const payloadMorse = customMorse || textToMorse(cipherText);
    const resolvedCategory = customPlain
      ? classifyBeaconCategory(rawPlain)
      : beaconCategory;
    ws.send(
      JSON.stringify({
        type: 'player:morse_beacon',
        morse: payloadMorse,
        cipherText,
        cipherType: cipherLabel,
        beaconType: resolvedCategory,
        plaintext: rawPlain,
      })
    );
    setSelfFlutterEcho({ cipherText, morse: payloadMorse, cipherType: cipherLabel });
    window.setTimeout(() => setSelfFlutterEcho(null), 5000);
    void audioEngine.playMorseSequence(payloadMorse, { wpm: 20, frequency: 740 });
  };

  const broadcastBeaconRef = useRef(broadcastMorseBeacon);
  broadcastBeaconRef.current = broadcastMorseBeacon;
  const lastAutoSentIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!connected || !pendingMorseBeacon?.autoSendId) return;
    if (lastAutoSentIdRef.current === pendingMorseBeacon.autoSendId) return;
    lastAutoSentIdRef.current = pendingMorseBeacon.autoSendId;
    setBeaconDraft(pendingMorseBeacon.plaintext);
    broadcastBeaconRef.current(pendingMorseBeacon.plaintext, pendingMorseBeacon.morse);
  }, [connected, pendingMorseBeacon]);

  useEffect(() => {
    if (voiceBeaconSignal > 0) {
      broadcastBeaconRef.current();
    }
  }, [voiceBeaconSignal]);

  useEffect(() => {
    if (voiceEncryptSignal <= 0) return;
    setArenaCipher((prev) => {
      const next: ArenaCipherMode =
        prev === 'caesar' ? 'vigenere' : prev === 'vigenere' ? 'atbash' : 'caesar';
      const rawPlain = (beaconDraft || pendingMorseBeacon?.plaintext || 'SOS ALFA').trim();
      const cipherText =
        next === 'caesar'
          ? applyCipher(rawPlain, 'caesar', 'encrypt', '7')
          : next === 'vigenere'
          ? applyCipher(rawPlain, 'vigenere', 'encrypt', 'SOLARIS')
          : applyCipher(rawPlain, 'atbash', 'encrypt', '');
      const cipherType =
        next === 'caesar' ? 'CAESAR +7' : next === 'vigenere' ? 'VIGENERE' : 'ATBASH';
      setSelfFlutterEcho({
        cipherText,
        morse: textToMorse(cipherText),
        cipherType,
      });
      window.setTimeout(() => setSelfFlutterEcho(null), 3200);
      return next;
    });
  }, [voiceEncryptSignal]);

  const updateMinimapZoom = (nextZoom: number) => {
    const clamped = Math.max(1, Math.min(3, Number(nextZoom.toFixed(2))));
    setMinimapZoom(clamped);
  };

  const resetMinimapView = () => {
    setMinimapZoom(1);
    setAutoCenter(true);
    autoCenterRef.current = true;
    freeCenterRef.current = { x: localPlayerRef.current.x, y: localPlayerRef.current.z };
  };

  const toggleAutoCenter = () => {
    setAutoCenter((prev) => {
      const next = !prev;
      autoCenterRef.current = next;
      if (!next) {
        const halfSpan = 36 / minimapZoomRef.current;
        freeCenterRef.current = {
          x: Math.max(-36 + halfSpan, Math.min(36 - halfSpan, localPlayerRef.current.x)),
          y: Math.max(-36 + halfSpan, Math.min(36 - halfSpan, localPlayerRef.current.z)),
        };
      }
      return next;
    });
  };

  useEffect(() => {
    const el = radarWrapperRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY < 0 ? 0.25 : -0.25;
      setMinimapZoom((z) => Math.max(1, Math.min(3, Number((z + delta).toFixed(2)))));
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Software-WebGL Probe (per threejs/SKILL.md)
    const isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError(UI_TRANSLATIONS[langRef.current].arena.webglError);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth || 1024, container.clientHeight || 620);

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError(UI_TRANSLATIONS[langRef.current].arena.webglLost);
    };
    const handleContextRestored = () => setWebglError(null);
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    // 2. Scene, Camera, RoomEnvironment & Lighting
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070b14);
    scene.fog = new THREE.FogExp2(0x070b14, 0.017);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      74,
      (container.clientWidth || 1024) / (container.clientHeight || 620),
      0.1,
      160
    );
    scene.add(camera);

    let fpRifle = createFirstPersonRifle('alpha');
    camera.add(fpRifle);

    // Balanced 3-point + hemisphere studio rig
    const hemi = new THREE.HemisphereLight(0x38bdf8, 0x0f172a, 0.75);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 1.35);
    keyLight.position.set(22, 34, 18);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.left = -38;
    keyLight.shadow.camera.right = 38;
    keyLight.shadow.camera.top = 38;
    keyLight.shadow.camera.bottom = -38;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x06b6d4, 0.55);
    rimLight.position.set(-24, 18, -24);
    scene.add(rimLight);

    // Floor with procedural CanvasTexture + max anisotropy + polygonOffset
    const floorTex = createArenaFloorTexture();
    floorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.55,
      metalness: 0.35,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(72, 72), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Arena Perimeter Walls (72x72)
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.5,
      metalness: 0.65,
    });
    const perimeterConfigs = [
      { x: 0, z: -36, w: 72, d: 1.5 },
      { x: 0, z: 36, w: 72, d: 1.5 },
      { x: -36, z: 0, w: 1.5, d: 72 },
      { x: 36, z: 0, w: 1.5, d: 72 },
    ];
    perimeterConfigs.forEach((p) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(p.w, 6, p.d), wallMat);
      wall.position.set(p.x, 3, p.z);
      scene.add(wall);
    });

    // Team Base Beacon Towers (Alpha Cyan & Omega Amber)
    const alphaBeacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.65, 5.2, 16),
      new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        emissive: 0x06b6d4,
        emissiveIntensity: 1.4,
      })
    );
    alphaBeacon.position.set(-30, 2.6, -30);
    scene.add(alphaBeacon);

    const omegaBeacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.65, 5.2, 16),
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.4,
      })
    );
    omegaBeacon.position.set(30, 2.6, 30);
    scene.add(omegaBeacon);

    // Dynamic obstacle group populated on arena:init
    const obstacleGroup = new THREE.Group();
    scene.add(obstacleGroup);

    const buildObstacles = (list: ArenaObstacle[]) => {
      obstacleGroup.clear();
      const pillarMat = new THREE.MeshStandardMaterial({
        color: 0x182235,
        roughness: 0.42,
        metalness: 0.68,
      });
      const trimMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0891b2,
        emissiveIntensity: 0.85,
        roughness: 0.25,
        metalness: 0.2,
      });
      list.forEach((obs) => {
        const block = new THREE.Mesh(new THREE.BoxGeometry(obs.w, obs.h, obs.d), pillarMat);
        block.position.set(obs.x, obs.h / 2, obs.z);
        block.castShadow = !isSoftwareGl;
        block.receiveShadow = true;

        const neonStrip = new THREE.Mesh(
          new THREE.BoxGeometry(obs.w + 0.08, 0.14, obs.d + 0.08),
          trimMat
        );
        neonStrip.position.set(obs.x, obs.h - 0.35, obs.z);

        obstacleGroup.add(block, neonStrip);
      });
    };

    // Remote combatant 3D meshes & floating Morse sprites
    const combatantMeshes = new Map<
      string,
      {
        group: THREE.Group;
        team: TeamId;
        beaconSprite?: THREE.Sprite;
        beaconExpiresAt?: number;
        beaconPhase?: number;
      }
    >();
    const beamMeshes: { mesh: THREE.Mesh; expiresAt: number }[] = [];

    // 3. WebSocket Multiplayer Connection
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'arena:init') {
          selfIdRef.current = msg.selfId;
          obstaclesRef.current = msg.obstacles || [];
          buildObstacles(obstaclesRef.current);
          setTeamScores(msg.teamScores);

          const map = new Map<string, ArenaCombatant>();
          (msg.combatants as ArenaCombatant[]).forEach((c) => map.set(c.id, c));
          combatantsRef.current = map;
          setCombatantCount(map.size);

          const self = map.get(msg.selfId);
          if (self) {
            localPlayerRef.current.x = self.x;
            localPlayerRef.current.z = self.z;
            localPlayerRef.current.yaw = self.yaw;
            camera.remove(fpRifle);
            fpRifle = createFirstPersonRifle(self.team);
            camera.add(fpRifle);
          }
        } else if (msg.type === 'arena:state') {
          setTeamScores(msg.teamScores);
          const nextIds = new Set<string>();
          let selfData: ArenaCombatant | undefined;
          (msg.combatants as ArenaCombatant[]).forEach((c) => {
            nextIds.add(c.id);
            combatantsRef.current.set(c.id, c);
            if (c.id === selfIdRef.current) {
              selfData = c;
            }
          });
          for (const key of combatantsRef.current.keys()) {
            if (!nextIds.has(key)) combatantsRef.current.delete(key);
          }
          setCombatantCount(combatantsRef.current.size);
          if (selfData) {
            setSelfStats({
              id: selfData.id,
              team: selfData.team,
              health: selfData.health,
              shield: selfData.shield,
              kills: selfData.kills,
              deaths: selfData.deaths,
              hits: selfData.hits ?? 0,
              misses: selfData.misses ?? 0,
              alive: selfData.alive,
            });
          }
        } else if (msg.type === 'arena:laser') {
          activeBeamsRef.current.push({
            from: msg.from,
            to: msg.to,
            team: msg.team,
            expiresAt: performance.now() + 180,
            created: false,
          });
          if (msg.shooterId === selfIdRef.current) {
            if (msg.hitId) {
              setHitMarkerAt(performance.now());
              audioEngine.playHitConfirm();
              setSelfStats((prev) => ({ ...prev, hits: prev.hits + 1 }));
            } else {
              setSelfStats((prev) => ({ ...prev, misses: prev.misses + 1 }));
            }
          }
          if (msg.hitId === selfIdRef.current) {
            audioEngine.playDamageTaken();
          }
        } else if (msg.type === 'arena:kill') {
          setTeamScores(msg.teamScores);
          setKillFeed((prev) => [
            {
              id: `${Date.now()}_${Math.random()}`,
              killerName: msg.killerName,
              killerTeam: msg.killerTeam,
              victimName: msg.victimName,
              victimTeam: msg.victimTeam,
            },
            ...prev.slice(0, 4),
          ]);
        } else if (msg.type === 'arena:morse_beacon') {
          const cipherText = msg.cipherText || msg.plaintext || 'SOS';
          const cipherType = msg.cipherType || 'MORSE';
          const beaconType = classifyBeaconCategory(
            msg.plaintext || cipherText,
            msg.beaconType
          );
          const sender = combatantsRef.current.get(msg.playerId);
          const bx = msg.playerId === selfIdRef.current ? localPlayerRef.current.x : sender?.x;
          const bz = msg.playerId === selfIdRef.current ? localPlayerRef.current.z : sender?.z;
          if (typeof bx === 'number' && typeof bz === 'number') {
            minimapBeaconsRef.current.push({
              x: bx,
              z: bz,
              team: msg.team,
              beaconType,
              expiresAt: performance.now() + 7500,
            });
          }
          pendingBeaconsRef.current.push({
            playerId: msg.playerId,
            playerName: msg.playerName,
            team: msg.team,
            morse: msg.morse,
            cipherText,
            cipherType,
            expiresAt: performance.now() + 7500,
            phase: Math.random() * Math.PI * 2,
          });
          setBeaconFeed((prev) => [
            {
              id: `${Date.now()}_${Math.random()}`,
              playerId: msg.playerId,
              playerName: msg.playerName,
              team: msg.team,
              morse: msg.morse,
              cipherText,
              cipherType,
              plaintext: msg.plaintext || cipherText,
            },
            ...prev.slice(0, 3),
          ]);
        }
      } catch {
        // ignore malformed packets
      }
    };

    // 4. First-Person Controls (PointerLock + Keyboard + Fallback Click/Drag)
    const keys: Record<string, boolean> = {};
    let lastShotAt = 0;

    const fireWeapon = () => {
      const now = performance.now();
      if (now - lastShotAt < 180) return;
      const self = combatantsRef.current.get(selfIdRef.current);
      if (self && !self.alive) return;
      lastShotAt = now;

      localPlayerRef.current.recoil = 0.08;
      audioEngine.playLaserShot((self?.team ?? 'alpha') === 'alpha');

      _rayOrigin.set(
        localPlayerRef.current.x,
        localPlayerRef.current.y + 1.48,
        localPlayerRef.current.z
      );
      camera.getWorldDirection(_rayDir);

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'player:shoot',
            ox: _rayOrigin.x,
            oy: _rayOrigin.y,
            oz: _rayOrigin.z,
            dx: _rayDir.x,
            dy: _rayDir.y,
            dz: _rayDir.z,
          })
        );
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'SELECT') return;
      keys[e.code] = true;
      if (e.code === 'KeyH') {
        setHudCollapsed((v) => !v);
      }
      if (e.code === 'KeyE') {
        broadcastBeaconRef.current();
      }
      if (e.code === 'KeyF') {
        fireWeapon();
      }
      if (e.code === 'Space' && localPlayerRef.current.grounded) {
        localPlayerRef.current.vy = 6.2;
        localPlayerRef.current.grounded = false;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement === renderer.domElement) {
        localPlayerRef.current.yaw -= e.movementX * 0.0022;
        localPlayerRef.current.pitch = THREE.MathUtils.clamp(
          localPlayerRef.current.pitch - e.movementY * 0.0022,
          -1.15,
          1.15
        );
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.target !== renderer.domElement) return;
      if (document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock?.();
      } else if (e.button === 0) {
        fireWeapon();
      }
    };

    const onPointerLockChange = () => {
      setPointerLocked(document.pointerLockElement === renderer.domElement);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    document.addEventListener('pointerlockchange', onPointerLockChange);

    const onResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || 620;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 5. Game Loop with Software-WebGL Pacing
    let frameId = 0;
    let lastTime = performance.now();
    let lastNetSend = 0;
    let disposed = false;

    const collidesWithObstacle = (x: number, z: number) => {
      if (Math.abs(x) > 34.4 || Math.abs(z) > 34.4) return true;
      for (const obs of obstaclesRef.current) {
        if (Math.abs(x - obs.x) < obs.w / 2 + 0.55 && Math.abs(z - obs.z) < obs.d / 2 + 0.55) {
          return true;
        }
      }
      return false;
    };

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    // World-space Fog of War exploration canvas (256x256 covering -36..36m)
    const fogSize = 256;
    const fogCanvas = document.createElement('canvas');
    fogCanvas.width = fogSize;
    fogCanvas.height = fogSize;
    const fogCtx = fogCanvas.getContext('2d');
    let fogTeam: TeamId | null = null;
    let lastFogSampleAt = 0;
    const lastCarvedPos = new Map<string, { x: number; z: number }>();

    const resetFogMask = () => {
      if (!fogCtx) return;
      fogCtx.globalCompositeOperation = 'source-over';
      fogCtx.clearRect(0, 0, fogSize, fogSize);
      fogCtx.fillStyle = 'rgba(3, 6, 13, 0.94)';
      fogCtx.fillRect(0, 0, fogSize, fogSize);

      // Subtle tactical diagonal hatch over unexplored terrain
      fogCtx.strokeStyle = 'rgba(30, 41, 59, 0.4)';
      fogCtx.lineWidth = 1;
      for (let i = -fogSize; i < fogSize * 2; i += 10) {
        fogCtx.beginPath();
        fogCtx.moveTo(i, 0);
        fogCtx.lineTo(i - 48, fogSize);
        fogCtx.stroke();
      }
      lastCarvedPos.clear();
    };

    const carveFogVision = (id: string, wx: number, wz: number, radiusMeters: number, minStep: number) => {
      if (!fogCtx) return;
      const prev = lastCarvedPos.get(id);
      if (prev && Math.hypot(wx - prev.x, wz - prev.z) < minStep) return;
      lastCarvedPos.set(id, { x: wx, z: wz });

      const fx = ((wx + 36) / 72) * fogSize;
      const fy = ((wz + 36) / 72) * fogSize;
      const rPx = (radiusMeters / 72) * fogSize;
      const grad = fogCtx.createRadialGradient(fx, fy, rPx * 0.5, fx, fy, rPx);
      grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
      grad.addColorStop(0.75, 'rgba(0, 0, 0, 0.72)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      fogCtx.globalCompositeOperation = 'destination-out';
      fogCtx.fillStyle = grad;
      fogCtx.beginPath();
      fogCtx.arc(fx, fy, rPx, 0, Math.PI * 2);
      fogCtx.fill();
    };

    resetFogMask();

    const drawMinimap = (now: number) => {
      const canvas = radarCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const size = canvas.width;
      const zoom = minimapZoomRef.current;
      const filter = minimapFilterRef.current;
      const scale = (size * zoom) / 72;
      const halfSpan = 36 / zoom;

      const selfCombatant = combatantsRef.current.get(selfIdRef.current);
      const selfTeam: TeamId = selfCombatant?.team ?? 'alpha';
      if (fogTeam !== selfTeam) {
        fogTeam = selfTeam;
        resetFogMask();
      }

      // Carve explored areas dynamically for player and alive teammates
      if (!selfCombatant || selfCombatant.alive) {
        carveFogVision('__self__', localPlayerRef.current.x, localPlayerRef.current.z, 12, 0.5);
      }
      for (const c of combatantsRef.current.values()) {
        if (c.id === selfIdRef.current || c.team !== selfTeam || !c.alive) continue;
        carveFogVision(c.id, c.x, c.z, 9.5, 0.7);
      }

      if (fogCtx && now - lastFogSampleAt > 600) {
        lastFogSampleAt = now;
        const img = fogCtx.getImageData(0, 0, fogSize, fogSize).data;
        let cleared = 0;
        let total = 0;
        for (let py = 0; py < fogSize; py += 8) {
          for (let px = 0; px < fogSize; px += 8) {
            total++;
            const alpha = img[(py * fogSize + px) * 4 + 3];
            if (alpha < 110) cleared++;
          }
        }
        const pct = total > 0 ? Math.min(100, Math.round((cleared / total) * 100)) : 0;
        setExploredPct((prev) => (prev === pct ? prev : pct));
      }

      const rawCenterX = autoCenterRef.current ? localPlayerRef.current.x : freeCenterRef.current.x;
      const rawCenterZ = autoCenterRef.current ? localPlayerRef.current.z : freeCenterRef.current.y;
      const centerX = Math.max(-36 + halfSpan, Math.min(36 - halfSpan, rawCenterX));
      const centerZ = Math.max(-36 + halfSpan, Math.min(36 - halfSpan, rawCenterZ));
      if (autoCenterRef.current) {
        freeCenterRef.current = { x: centerX, y: centerZ };
      }
      const minX = centerX - halfSpan;
      const maxX = centerX + halfSpan;
      const minY = centerZ - halfSpan;
      const maxY = centerZ + halfSpan;
      const hover = hoverGridRef.current;
      const coordKey = `${centerX.toFixed(1)}:${centerZ.toFixed(1)}:${minX.toFixed(0)}:${maxX.toFixed(0)}:${minY.toFixed(0)}:${maxY.toFixed(0)}:${hover ? hover.x.toFixed(1) : 'n'}:${hover ? hover.y.toFixed(1) : 'n'}`;
      if (lastCoordsKeyRef.current !== coordKey) {
        lastCoordsKeyRef.current = coordKey;
        setMinimapCoords({
          centerX,
          centerY: centerZ,
          minX,
          maxX,
          minY,
          maxY,
          cursorX: hover ? hover.x : null,
          cursorY: hover ? hover.y : null,
        });
      }

      const nextHeading = ((Math.round((-localPlayerRef.current.yaw * 180) / Math.PI) % 360) + 360) % 360;
      if (lastHeadingRef.current !== nextHeading) {
        lastHeadingRef.current = nextHeading;
        setHeadingDeg(nextHeading);
      }

      const toX = (wx: number) => (wx - centerX) * scale + size / 2;
      const toZ = (wz: number) => (wz - centerZ) * scale + size / 2;

      ctx.fillStyle = '#070b14';
      ctx.fillRect(0, 0, size, size);

      // Subtle sector grid lines (-18, 0, 18 world lines) + numeric grid axis ticks
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.font = '600 8px "JetBrains Mono", monospace';
      for (const wg of [-18, 0, 18]) {
        const gx = toX(wg);
        const gz = toZ(wg);
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, gz);
        ctx.lineTo(size, gz);
        ctx.stroke();

        const label = wg > 0 ? `+${wg}` : `${wg}`;
        ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
        if (gx > 12 && gx < size - 18) {
          ctx.fillText(label, gx + 3, size - 20);
        }
        if (gz > 26 && gz < size - 22) {
          ctx.fillText(label, 4, gz - 3);
        }
      }
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
      ctx.strokeRect(toX(-36), toZ(-36), 72 * scale, 72 * scale);

      // Obstacles
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.lineWidth = 1;
      for (const obs of obstaclesRef.current) {
        const rx = toX(obs.x - obs.w / 2);
        const rz = toZ(obs.z - obs.d / 2);
        const rw = obs.w * scale;
        const rd = obs.d * scale;
        ctx.fillRect(rx, rz, rw, rd);
        ctx.strokeRect(rx, rz, rw, rd);
      }

      // Static Team Base Tactical Beacons (blue tactical color, shown on 'all' or 'tactical')
      if (filter === 'all' || filter === 'tactical') {
        const drawBaseBeacon = (wx: number, wz: number, teamDotColor: string) => {
          const bx = toX(wx);
          const bz = toZ(wz);
          ctx.save();
          ctx.translate(bx, bz);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = '#3b82f6';
          ctx.fillRect(-4, -4, 8, 8);
          ctx.restore();
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.85)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(bx, bz, 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = teamDotColor;
          ctx.beginPath();
          ctx.arc(bx, bz, 1.8, 0, Math.PI * 2);
          ctx.fill();
        };
        drawBaseBeacon(-30, -30, '#22d3ee');
        drawBaseBeacon(30, 30, '#fbbf24');
      }

      const labelMode = minimapLabelModeRef.current;
      const drawCombatantMarkerLabel = (
        c: ArenaCombatant,
        px: number,
        pz: number,
        isSelf: boolean
      ) => {
        if (labelMode === 'off') return;
        const isAlpha = c.team === 'alpha';
        const teamSwatch = isAlpha ? '#22d3ee' : '#fbbf24';
        const textColor = isSelf ? '#f8fafc' : isAlpha ? '#a5f3fc' : '#fde68a';
        const nearRight = px > size - 28;
        const offset = isSelf ? 6.5 : 5.2;

        ctx.save();
        ctx.font = '700 7.5px "JetBrains Mono", monospace';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(7, 11, 20, 0.92)';

        if (labelMode === 'team') {
          const tag = isAlpha ? 'ALF' : 'OMG';
          if (nearRight) {
            ctx.fillStyle = '#070B14';
            ctx.fillRect(px - offset - 4.8, pz - 3.3, 5.6, 5.6);
            ctx.fillStyle = teamSwatch;
            ctx.fillRect(px - offset - 4, pz - 2.5, 4, 4);
            ctx.textAlign = 'right';
            ctx.strokeText(tag, px - offset - 6, pz + 2.5);
            ctx.fillStyle = teamSwatch;
            ctx.fillText(tag, px - offset - 6, pz + 2.5);
          } else {
            ctx.fillStyle = '#070B14';
            ctx.fillRect(px + offset - 0.8, pz - 3.3, 5.6, 5.6);
            ctx.fillStyle = teamSwatch;
            ctx.fillRect(px + offset, pz - 2.5, 4, 4);
            ctx.textAlign = 'left';
            ctx.strokeText(tag, px + offset + 5.8, pz + 2.5);
            ctx.fillStyle = teamSwatch;
            ctx.fillText(tag, px + offset + 5.8, pz + 2.5);
          }
        } else {
          const idText = formatCompactPlayerId(c);
          ctx.textAlign = nearRight ? 'right' : 'left';
          const textX = nearRight ? px - offset : px + offset;
          ctx.strokeText(idText, textX, pz + 2.5);
          ctx.fillStyle = textColor;
          ctx.fillText(idText, textX, pz + 2.5);
        }
        ctx.restore();
      };

      // Enemy Combatants (drawn beneath Fog of War so unexplored regions mask them)
      for (const c of combatantsRef.current.values()) {
        if (!c.alive || c.id === selfIdRef.current || c.team === selfTeam) continue;
        const px = toX(c.x);
        const pz = toZ(c.z);
        ctx.fillStyle = c.team === 'alpha' ? '#06b6d4' : '#f59e0b';
        ctx.beginPath();
        ctx.arc(px, pz, c.isBot ? 2.8 : 3.6, 0, Math.PI * 2);
        ctx.fill();
        if (!c.isBot) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        drawCombatantMarkerLabel(c, px, pz, false);
      }

      // Fog of War Mask Overlay (clips cleanly to zoomed/panned world bounds)
      ctx.drawImage(fogCanvas, toX(-36), toZ(-36), 72 * scale, 72 * scale);

      // Active Filtered Morse Signal Beacon Waves (Radio beacons pierce fog; Color-coded: SOS pulsing red, Tactical blue, Distraction yellow)
      minimapBeaconsRef.current = minimapBeaconsRef.current.filter((b) => b.expiresAt > now);
      for (const b of minimapBeaconsRef.current) {
        if (filter !== 'all' && b.beaconType !== filter) continue;
        const bx = toX(b.x);
        const bz = toZ(b.z);
        const wave = (now % 1100) / 1100;
        const radius = 5 + wave * 14 * Math.min(1.35, Math.sqrt(zoom));
        const alpha = 1 - wave;

        ctx.save();
        if (b.beaconType === 'sos') {
          const sosPulse = 0.5 + 0.5 * Math.sin(now * 0.012);
          // Pulsing red core marker
          ctx.fillStyle = `rgba(239, 68, 68, ${0.55 + 0.45 * sosPulse})`;
          ctx.beginPath();
          ctx.arc(bx, bz, 3 + sosPulse * 1.6, 0, Math.PI * 2);
          ctx.fill();

          // Concentric pulsing red wave rings
          ctx.strokeStyle = `rgba(239, 68, 68, ${Math.max(0.25, alpha)})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(bx, bz, radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = `rgba(248, 113, 113, ${0.4 + 0.6 * sosPulse})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(bx, bz, Math.max(3.5, radius * 0.55), 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#fca5a5';
          ctx.font = '700 8px "JetBrains Mono", monospace';
          ctx.fillText('SOS', bx + 6, bz - 5);
        } else if (b.beaconType === 'distraction') {
          // Yellow center diamond
          ctx.save();
          ctx.translate(bx, bz);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = '#facc15';
          ctx.fillRect(-2.5, -2.5, 5, 5);
          ctx.restore();

          // Dashed yellow wave ring
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = `rgba(250, 204, 21, ${Math.max(0.2, alpha)})`;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(bx, bz, radius, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#fde047';
          ctx.font = '700 8px "JetBrains Mono", monospace';
          ctx.fillText('DEC', bx + 6, bz - 5);
        } else {
          // Blue tactical beacon core + wave ring
          ctx.fillStyle = '#3b82f6';
          ctx.beginPath();
          ctx.arc(bx, bz, 3, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = `rgba(59, 130, 246, ${Math.max(0.2, alpha)})`;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(bx, bz, radius, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#93c5fd';
          ctx.font = '700 8px "JetBrains Mono", monospace';
          ctx.fillText('TAC', bx + 6, bz - 5);
        }
        ctx.restore();
      }

      // Friendly Teammates & Local Player (always visible on top of Fog of War)
      for (const c of combatantsRef.current.values()) {
        if (!c.alive) continue;
        const isSelf = c.id === selfIdRef.current;
        if (!isSelf && c.team !== selfTeam) continue;
        const px = toX(isSelf ? localPlayerRef.current.x : c.x);
        const pz = toZ(isSelf ? localPlayerRef.current.z : c.z);

        if (isSelf) {
          // Draw FOV cone for local player
          const angle = -localPlayerRef.current.yaw - Math.PI / 2;
          const fovRadius = 18 * Math.min(1.5, Math.sqrt(zoom));
          ctx.fillStyle = 'rgba(34, 211, 238, 0.18)';
          ctx.beginPath();
          ctx.moveTo(px, pz);
          ctx.arc(px, pz, fovRadius, angle - 0.48, angle + 0.48);
          ctx.closePath();
          ctx.fill();

          // Local player white marker
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(px, pz, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = c.team === 'alpha' ? '#22d3ee' : '#fbbf24';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else {
          ctx.fillStyle = c.team === 'alpha' ? '#06b6d4' : '#f59e0b';
          ctx.beginPath();
          ctx.arc(px, pz, c.isBot ? 2.8 : 3.6, 0, Math.PI * 2);
          ctx.fill();
          if (!c.isBot) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
        drawCombatantMarkerLabel(c, px, pz, isSelf);
      }

      // Free-pan tactical focus reticle at viewport center
      if (!autoCenterRef.current && zoom > 1) {
        const cx = size / 2;
        const cz = size / 2;
        ctx.save();
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 6, cz);
        ctx.lineTo(cx - 2, cz);
        ctx.moveTo(cx + 2, cz);
        ctx.lineTo(cx + 6, cz);
        ctx.moveTo(cx, cz - 6);
        ctx.lineTo(cx, cz - 2);
        ctx.moveTo(cx, cz + 2);
        ctx.lineTo(cx, cz + 6);
        ctx.stroke();
        ctx.restore();
      }
    };

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const lp = localPlayerRef.current;
      const selfServer = combatantsRef.current.get(selfIdRef.current);

      // Fallback keyboard turning (Q / ArrowLeft / ArrowRight)
      if (keys['ArrowLeft'] || keys['KeyQ']) lp.yaw += 2.2 * dt;
      if (keys['ArrowRight']) lp.yaw -= 2.2 * dt;

      if (!selfServer || selfServer.alive) {
        const dashBoost = keys['ShiftLeft'] ? 1.55 : 1.0;
        const speed = 9.5 * dashBoost;

        _forward.set(-Math.sin(lp.yaw), 0, -Math.cos(lp.yaw));
        _right.set(Math.cos(lp.yaw), 0, -Math.sin(lp.yaw));
        _moveVec.set(0, 0, 0);

        if (keys['KeyW'] || keys['ArrowUp']) _moveVec.add(_forward);
        if (keys['KeyS'] || keys['ArrowDown']) _moveVec.sub(_forward);
        if (keys['KeyD']) _moveVec.add(_right);
        if (keys['KeyA']) _moveVec.sub(_right);

        if (_moveVec.lengthSq() > 0) {
          _moveVec.normalize().multiplyScalar(speed * dt);
          if (!collidesWithObstacle(lp.x + _moveVec.x, lp.z)) lp.x += _moveVec.x;
          if (!collidesWithObstacle(lp.x, lp.z + _moveVec.z)) lp.z += _moveVec.z;
        }

        // Gravity & Jump
        lp.vy -= 17 * dt;
        lp.y += lp.vy * dt;
        if (lp.y <= 0) {
          lp.y = 0;
          lp.vy = 0;
          lp.grounded = true;
        }
      } else {
        // Respawn sync
        lp.x = selfServer.x;
        lp.z = selfServer.z;
        lp.y = 0;
      }

      // Apply camera transform
      camera.position.set(lp.x, lp.y + 1.55, lp.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.y = lp.yaw;
      camera.rotation.x = lp.pitch;

      // Viewmodel recoil damping
      lp.recoil = THREE.MathUtils.damp(lp.recoil, 0, 14, dt);
      fpRifle.position.z = -0.38 + lp.recoil;

      // Send local position to server at 20Hz
      if (ws.readyState === WebSocket.OPEN && now - lastNetSend > 50) {
        lastNetSend = now;
        ws.send(
          JSON.stringify({
            type: 'player:move',
            x: lp.x,
            y: lp.y,
            z: lp.z,
            yaw: lp.yaw + Math.PI,
          })
        );
      }

      // Sync remote combatants with smooth exponential damping
      const activeIds = new Set<string>();
      for (const c of combatantsRef.current.values()) {
        if (c.id === selfIdRef.current) continue;
        activeIds.add(c.id);

        let entry = combatantMeshes.get(c.id);
        if (!entry || entry.team !== c.team) {
          if (entry) {
            if (entry.beaconSprite) {
              entry.beaconSprite.material.map?.dispose();
              entry.beaconSprite.material.dispose();
            }
            scene.remove(entry.group);
          }
          const rig = createCombatantRig(c.team);
          rig.position.set(c.x, c.y, c.z);
          scene.add(rig);
          entry = { group: rig, team: c.team };
          combatantMeshes.set(c.id, entry);
        }

        entry.group.visible = c.alive;
        entry.group.position.x = THREE.MathUtils.damp(entry.group.position.x, c.x, 12, dt);
        entry.group.position.y = THREE.MathUtils.damp(entry.group.position.y, c.y, 12, dt);
        entry.group.position.z = THREE.MathUtils.damp(entry.group.position.z, c.z, 12, dt);
        entry.group.rotation.y = c.yaw;
      }

      // Attach any newly arrived encrypted Morse floating sprites to avatar rigs
      if (pendingBeaconsRef.current.length > 0) {
        const queued = pendingBeaconsRef.current.splice(0, pendingBeaconsRef.current.length);
        for (const qb of queued) {
          if (qb.playerId === selfIdRef.current) continue;
          const entry = combatantMeshes.get(qb.playerId);
          if (!entry) continue;
          if (entry.beaconSprite) {
            entry.group.remove(entry.beaconSprite);
            entry.beaconSprite.material.map?.dispose();
            entry.beaconSprite.material.dispose();
          }
          const sprite = createFloatingMorseSprite(
            qb.playerName,
            qb.team,
            qb.cipherType,
            qb.cipherText,
            qb.morse
          );
          entry.group.add(sprite);
          entry.beaconSprite = sprite;
          entry.beaconExpiresAt = qb.expiresAt;
          entry.beaconPhase = qb.phase;
        }
      }

      // Animate fluttering floating Morse sprites above avatars
      const tSec = now * 0.001;
      for (const entry of combatantMeshes.values()) {
        if (!entry.beaconSprite || !entry.beaconExpiresAt) continue;
        const remaining = entry.beaconExpiresAt - now;
        if (remaining <= 0) {
          entry.group.remove(entry.beaconSprite);
          entry.beaconSprite.material.map?.dispose();
          entry.beaconSprite.material.dispose();
          entry.beaconSprite = undefined;
          entry.beaconExpiresAt = undefined;
          continue;
        }
        const phase = entry.beaconPhase ?? 0;
        entry.beaconSprite.position.y = 2.45 + Math.sin(tSec * 3.2 + phase) * 0.14;
        entry.beaconSprite.position.x = Math.sin(tSec * 2.1 + phase) * 0.1;
        entry.beaconSprite.material.rotation = Math.sin(tSec * 4.4 + phase) * 0.055;
        entry.beaconSprite.material.opacity = remaining < 1400 ? Math.max(0, remaining / 1400) : 1;
      }

      for (const [id, entry] of combatantMeshes.entries()) {
        if (!activeIds.has(id)) {
          if (entry.beaconSprite) {
            entry.beaconSprite.material.map?.dispose();
            entry.beaconSprite.material.dispose();
          }
          scene.remove(entry.group);
          combatantMeshes.delete(id);
        }
      }

      // Spawn & expire laser beam meshes
      for (const b of activeBeamsRef.current) {
        if (b.created) continue;
        b.created = true;
        const p1 = new THREE.Vector3(...b.from);
        const p2 = new THREE.Vector3(...b.to);
        const dist = p1.distanceTo(p2);
        if (dist > 0.2) {
          const beamGeo = new THREE.CylinderGeometry(0.038, 0.038, dist, 6);
          const beamMat = new THREE.MeshBasicMaterial({
            color: b.team === 'alpha' ? 0x22d3ee : 0xfbbf24,
            transparent: true,
            opacity: 0.92,
          });
          const beamMesh = new THREE.Mesh(beamGeo, beamMat);
          _beamMid.addVectors(p1, p2).multiplyScalar(0.5);
          beamMesh.position.copy(_beamMid);
          _beamQuat.setFromUnitVectors(_beamUp, p2.clone().sub(p1).normalize());
          beamMesh.quaternion.copy(_beamQuat);
          scene.add(beamMesh);
          beamMeshes.push({ mesh: beamMesh, expiresAt: b.expiresAt });
        }
      }
      activeBeamsRef.current = activeBeamsRef.current.filter((b) => !b.created);

      for (let i = beamMeshes.length - 1; i >= 0; i--) {
        const bm = beamMeshes[i];
        if (now >= bm.expiresAt) {
          scene.remove(bm.mesh);
          bm.mesh.geometry.dispose();
          (bm.mesh.material as THREE.Material).dispose();
          beamMeshes.splice(i, 1);
        }
      }

      drawMinimap(now);
      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      ws.close();
      floorTex.dispose();
      floorMat.dispose();
      renderer.dispose();
    };
  }, []);

  const handleJoinCallsign = (e: React.FormEvent) => {
    e.preventDefault();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'player:join', name: callsign }));
    }
  };

  const handleSwitchTeam = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'player:switch_team' }));
    }
  };

  const showHitMarker = performance.now() - hitMarkerAt < 180;
  const totalShots = selfStats.hits + selfStats.misses;
  const accuracyPct = totalShots > 0 ? Math.round((selfStats.hits / totalShots) * 100) : 0;
  const isMinimapOffset = minimapZoom > 1 || !autoCenter;
  const isCursorActive = minimapCoords.cursorX !== null && minimapCoords.cursorY !== null;
  const activeGridX = isCursorActive ? (minimapCoords.cursorX as number) : minimapCoords.centerX;
  const activeGridY = isCursorActive ? (minimapCoords.cursorY as number) : minimapCoords.centerY;
  const activeSector = getSectorCode(activeGridX, activeGridY);
  const activeCardinal = getCardinalLabel(headingDeg);

  const clientToMinimapGrid = (clientX: number, clientY: number) => {
    const canvas = radarCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const zoom = minimapZoomRef.current;
    const scale = (canvas.width * zoom) / 72;
    const halfSpan = 36 / zoom;
    const rawCenterX = autoCenterRef.current ? localPlayerRef.current.x : freeCenterRef.current.x;
    const rawCenterZ = autoCenterRef.current ? localPlayerRef.current.z : freeCenterRef.current.y;
    const centerX = Math.max(-36 + halfSpan, Math.min(36 - halfSpan, rawCenterX));
    const centerZ = Math.max(-36 + halfSpan, Math.min(36 - halfSpan, rawCenterZ));
    const canvasX = ((clientX - rect.left) / rect.width) * canvas.width;
    const canvasY = ((clientY - rect.top) / rect.height) * canvas.height;
    return {
      x: Math.max(-36, Math.min(36, (canvasX - canvas.width / 2) / scale + centerX)),
      y: Math.max(-36, Math.min(36, (canvasY - canvas.height / 2) / scale + centerZ)),
    };
  };

  const handleMinimapPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const halfSpan = 36 / minimapZoomRef.current;
    const rawCenterX = autoCenterRef.current ? localPlayerRef.current.x : freeCenterRef.current.x;
    const rawCenterY = autoCenterRef.current ? localPlayerRef.current.z : freeCenterRef.current.y;
    dragStateRef.current = {
      dragging: false,
      startX: e.clientX,
      startY: e.clientY,
      startCenterX: Math.max(-36 + halfSpan, Math.min(36 - halfSpan, rawCenterX)),
      startCenterY: Math.max(-36 + halfSpan, Math.min(36 - halfSpan, rawCenterY)),
    };
  };

  const handleMinimapPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const drag = dragStateRef.current;
    const canvas = radarCanvasRef.current;
    if (drag && canvas) {
      const dxPx = e.clientX - drag.startX;
      const dyPx = e.clientY - drag.startY;
      if (!drag.dragging && Math.hypot(dxPx, dyPx) > 3) {
        drag.dragging = true;
        setIsPanningMap(true);
        setAutoCenter(false);
        autoCenterRef.current = false;
        if (minimapZoomRef.current <= 1) {
          drag.startCenterX = 0;
          drag.startCenterY = 0;
          setMinimapZoom(1.5);
          minimapZoomRef.current = 1.5;
        }
      }
      if (drag.dragging) {
        const rect = canvas.getBoundingClientRect();
        const zoom = Math.max(1.25, minimapZoomRef.current);
        const halfSpan = 36 / zoom;
        const scalePx = (rect.width * zoom) / 72;
        if (scalePx > 0) {
          const rawCenterX = drag.startCenterX - dxPx / scalePx;
          const rawCenterY = drag.startCenterY - dyPx / scalePx;
          const clampedX = Math.max(-36 + halfSpan, Math.min(36 - halfSpan, rawCenterX));
          const clampedY = Math.max(-36 + halfSpan, Math.min(36 - halfSpan, rawCenterY));
          freeCenterRef.current = { x: clampedX, y: clampedY };
        }
      }
    }
    const gridPt = clientToMinimapGrid(e.clientX, e.clientY);
    if (gridPt) {
      hoverGridRef.current = gridPt;
      setMinimapCoords((prev) => ({ ...prev, cursorX: gridPt.x, cursorY: gridPt.y }));
    }
  };

  const handleMinimapPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragStateRef.current = null;
    setIsPanningMap(false);
  };

  const handleMinimapPointerLeave = () => {
    if (!dragStateRef.current?.dragging) {
      hoverGridRef.current = null;
      setMinimapCoords((prev) => ({ ...prev, cursorX: null, cursorY: null }));
    }
  };

  return (
    <div className="relative w-full h-[calc(100vh-140px)] min-h-[560px] rounded-2xl overflow-hidden border border-white/10 bg-[#070b14]">
      {/* Isolated WebGL Viewport Container */}
      <div ref={mountRef} className="w-full h-full cursor-crosshair" />

      {webglError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#070b14] text-slate-300 text-sm p-6 text-center">
          {webglError}
        </div>
      )}

      {/* Top-Left: Match Score & Real-Time Player Statistics Panel */}
      <div className="absolute top-4 left-4 z-10 pointer-events-auto flex flex-col gap-2.5">
        <div className="flex items-center gap-4 bg-[#0B0F17]/90 border border-white/10 rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-3 tabular-nums">
            <div className="text-center">
              <div className="text-[10px] font-medium text-cyan-400">ALFA</div>
              <div className="font-mono text-xl font-bold text-white">{teamScores.alpha}</div>
            </div>
            <span className="text-slate-600 font-mono">:</span>
            <div className="text-center">
              <div className="text-[10px] font-medium text-amber-400">OMEGA</div>
              <div className="font-mono text-xl font-bold text-white">{teamScores.omega}</div>
            </div>
          </div>

          <div className="h-7 w-px bg-white/10" />

          <div className="text-xs text-slate-300 space-y-0.5 tabular-nums">
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-cyan-400" />
              <span>
                {combatantCount} {t.activeCount}
              </span>
              <span aria-hidden="true">·</span>
              <span className={connected ? 'text-emerald-400' : 'text-slate-400'}>
                {connected ? 'WS Live' : 'Sync...'}
              </span>
            </div>
            <div className="font-mono text-[11px] text-slate-400">
              K {selfStats.kills} / D {selfStats.deaths}
            </div>
          </div>
        </div>

        {/* Real-Time Player Telemetry Panel: Hits, Misses, Accuracy */}
        {!hudCollapsed && (
          <div className="bg-[#0B0F17]/90 border border-white/10 rounded-xl px-4 py-2.5 space-y-2 tabular-nums">
            <div className="flex items-center justify-between gap-4 text-[11px] text-slate-400">
              <span>{t.playerStats}</span>
              <span className="font-mono text-slate-300">
                {totalShots} {t.shots}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <div className="text-[10px] text-slate-400">{t.hits}</div>
                <div className="font-mono text-sm font-semibold text-emerald-400">
                  {selfStats.hits}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">{t.misses}</div>
                <div className="font-mono text-sm font-semibold text-rose-400">
                  {selfStats.misses}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">{t.accuracy}</div>
                <div className="font-mono text-sm font-semibold text-cyan-300">
                  {accuracyPct}%
                </div>
              </div>
            </div>

            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-400 transition-all duration-150"
                style={{ width: `${accuracyPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Top-Right: #minimap-container Control Panel & Kill Feed */}
      <div className="absolute top-4 right-4 z-10 pointer-events-none flex flex-col items-end gap-2.5">
        <div
          id="minimap-container"
          className="pointer-events-auto w-[248px] bg-[#0B0F17]/95 border border-white/10 rounded-xl p-2.5 space-y-2"
        >
          {/* Header & Zoom Step Controls */}
          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-300 px-0.5">
            <span className="font-medium truncate">{t.minimapTitle}</span>
            <div className="flex items-center gap-1 shrink-0 tabular-nums">
              <button
                type="button"
                onClick={() => updateMinimapZoom(minimapZoom - 0.25)}
                disabled={minimapZoom <= 1}
                aria-label={t.zoomOut}
                className="p-1 rounded bg-[#111827] border border-white/10 text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer"
              >
                <ZoomOut className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={resetMinimapView}
                title={t.resetZoom}
                className="px-1.5 py-0.5 rounded bg-[#111827] border border-white/10 font-mono text-[10px] text-cyan-300 hover:border-cyan-500/50 cursor-pointer whitespace-nowrap"
              >
                {minimapZoom.toFixed(1)}×
              </button>
              <button
                type="button"
                onClick={() => updateMinimapZoom(minimapZoom + 0.25)}
                disabled={minimapZoom >= 3}
                aria-label={t.zoomIn}
                className="p-1 rounded bg-[#111827] border border-white/10 text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer"
              >
                <ZoomIn className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Beacon Type Filter Bar */}
          <div
            role="group"
            aria-label={t.filterAria}
            className="flex items-center gap-0.5 p-0.5 bg-[#111827] border border-white/10 rounded-lg"
          >
            {(
              [
                { id: 'all', label: t.filterAll },
                { id: 'sos', label: t.filterSos },
                { id: 'tactical', label: t.filterTactical },
                { id: 'distraction', label: t.filterDecoy },
              ] as const
            ).map((f) => {
              const active = minimapFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setMinimapFilter(f.id)}
                  aria-pressed={active}
                  className={`flex-1 px-1.5 py-1 text-[10px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? f.id === 'sos'
                        ? 'bg-red-500 text-white font-semibold'
                        : f.id === 'tactical'
                        ? 'bg-blue-500 text-white font-semibold'
                        : f.id === 'distraction'
                        ? 'bg-yellow-400 text-slate-950 font-semibold'
                        : 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Square 2D Arena Radar Canvas + Live X/Y Grid Coordinate Overlay */}
          <div
            ref={radarWrapperRef}
            title={t.panHint}
            onPointerDown={handleMinimapPointerDown}
            onPointerMove={handleMinimapPointerMove}
            onPointerUp={handleMinimapPointerUp}
            onPointerCancel={handleMinimapPointerUp}
            onPointerLeave={handleMinimapPointerLeave}
            className={`relative rounded-lg overflow-hidden border border-white/5 select-none touch-none ${
              isPanningMap ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          >
            <canvas
              ref={radarCanvasRef}
              width={200}
              height={200}
              className="w-full aspect-square block"
            />

            {/* Tactical X/Y Grid Coordinate Overlay + Floating Rotating Compass */}
            <div
              id="minimap-coords-overlay"
              aria-live="polite"
              className="pointer-events-none absolute inset-0 flex flex-col justify-between p-1.5"
            >
              <div className="flex items-center justify-between gap-1">
                <div className="bg-[#070B14]/85 border border-white/10 rounded px-1.5 py-0.5 font-mono text-[10px] leading-tight tabular-nums text-slate-200">
                  <span className="text-slate-400 mr-1">
                    {isCursorActive ? t.gridCursorLabel : t.gridViewLabel}
                  </span>
                  <span className="text-cyan-300">X {formatGridCoord(activeGridX)}</span>
                  <span className="text-slate-500 mx-1">/</span>
                  <span className="text-amber-300">Y {formatGridCoord(activeGridY)}</span>
                </div>
                <div className="bg-[#070B14]/85 border border-white/10 rounded px-1.5 py-0.5 font-mono text-[10px] leading-tight tabular-nums text-slate-300">
                  {t.sectorShort} {activeSector}
                </div>
              </div>

              {/* Floating Tactical Orientation Compass */}
              <div
                id="minimap-compass-overlay"
                aria-label={`${t.compassAria}: ${String(headingDeg).padStart(3, '0')}° ${activeCardinal}`}
                className="self-end mb-0.5 flex flex-col items-center gap-0.5"
              >
                <div className="relative w-11 h-11 rounded-full bg-[#070B14]/88 border border-white/15 flex items-center justify-center shadow-lg">
                  {/* Fixed Top View-Orientation Lubber Triangle */}
                  <svg
                    viewBox="0 0 10 6"
                    className="w-2 h-1.5 absolute -top-0.5 left-1/2 -translate-x-1/2 z-10 text-cyan-400"
                    aria-hidden="true"
                  >
                    <polygon points="5,0 9,6 1,6" fill="currentColor" />
                  </svg>

                  {/* Rotating Compass Rose Dial */}
                  <svg
                    viewBox="0 0 44 44"
                    className="w-10 h-10 will-change-transform"
                    style={{ transform: `rotate(${-headingDeg}deg)` }}
                    aria-hidden="true"
                  >
                    <circle
                      cx="22"
                      cy="22"
                      r="18"
                      fill="none"
                      stroke="rgba(148,163,184,0.22)"
                      strokeWidth="1"
                    />
                    {/* Intercardinal 45° Ticks */}
                    <line x1="34.7" y1="9.3" x2="32.6" y2="11.4" stroke="rgba(148,163,184,0.45)" strokeWidth="1" />
                    <line x1="34.7" y1="34.7" x2="32.6" y2="32.6" stroke="rgba(148,163,184,0.45)" strokeWidth="1" />
                    <line x1="9.3" y1="34.7" x2="11.4" y2="32.6" stroke="rgba(148,163,184,0.45)" strokeWidth="1" />
                    <line x1="9.3" y1="9.3" x2="11.4" y2="11.4" stroke="rgba(148,163,184,0.45)" strokeWidth="1" />

                    {/* North Pointer & Cardinal Labels */}
                    <polygon points="22,4.5 24,8.5 20,8.5" fill="#f87171" />
                    <text
                      x="22"
                      y="14"
                      textAnchor="middle"
                      fill="#f87171"
                      fontSize="6.5"
                      fontWeight="700"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      N
                    </text>
                    <text
                      x="35.5"
                      y="24.2"
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize="5.8"
                      fontWeight="600"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      E
                    </text>
                    <text
                      x="22"
                      y="37.5"
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize="5.8"
                      fontWeight="600"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      S
                    </text>
                    <text
                      x="8.5"
                      y="24.2"
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize="5.8"
                      fontWeight="600"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      W
                    </text>
                    <circle cx="22" cy="22" r="1.5" fill="#22d3ee" />
                  </svg>
                </div>
                <span className="bg-[#070B14]/90 border border-white/10 rounded px-1 py-0.5 font-mono text-[9px] leading-none tabular-nums text-cyan-300">
                  {String(headingDeg).padStart(3, '0')}° {activeCardinal}
                </span>
              </div>

              <div className="bg-[#070B14]/85 border border-white/10 rounded px-1.5 py-0.5 flex items-center justify-between gap-1 font-mono text-[9.5px] leading-tight tabular-nums text-slate-400">
                <span>
                  X [{Math.round(minimapCoords.minX)}..{Math.round(minimapCoords.maxX)}]
                </span>
                <span>
                  Y [{Math.round(minimapCoords.minY)}..{Math.round(minimapCoords.maxY)}]
                </span>
              </div>
            </div>
          </div>

          {/* Auto-Center Toggle + Fine Zoom Slider + Visible Range */}
          <div className="flex items-center gap-1.5 px-0.5">
            <button
              type="button"
              id="minimap-autocenter-btn"
              onClick={toggleAutoCenter}
              aria-pressed={autoCenter}
              aria-label={autoCenter ? t.autoCenterOn : t.autoCenterOff}
              title={autoCenter ? t.autoCenterOn : t.autoCenterOff}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                autoCenter
                  ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-300'
                  : 'bg-[#111827] border-white/10 text-slate-400 hover:text-slate-200'
              }`}
            >
              <LocateFixed className="w-3 h-3 shrink-0" />
              <span>{t.autoCenterShort}</span>
            </button>
            <input
              type="range"
              min={1}
              max={3}
              step={0.25}
              value={minimapZoom}
              onChange={(e) => updateMinimapZoom(Number(e.target.value))}
              aria-label={t.zoomLevelAria}
              className="flex-1 min-w-0 h-1 accent-cyan-400 cursor-pointer"
            />
            <span className="font-mono text-[10px] text-slate-400 tabular-nums shrink-0">
              {Math.round(72 / minimapZoom)}m
            </span>
            {isMinimapOffset && (
              <button
                type="button"
                onClick={resetMinimapView}
                aria-label={t.resetZoom}
                className="text-slate-400 hover:text-cyan-300 cursor-pointer shrink-0"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Player Marker Display Mode Selector (Dots / ID / Team Color) */}
          <div className="flex items-center gap-1.5 px-0.5">
            <Users className="w-3 h-3 text-slate-400 shrink-0" aria-hidden="true" />
            <div
              id="minimap-player-labels"
              role="group"
              aria-label={t.playerLabelsAria}
              className="flex-1 flex items-center gap-0.5 p-0.5 bg-[#111827] border border-white/10 rounded-lg"
            >
              {(
                [
                  { id: 'off', label: t.playerLabelOff },
                  { id: 'id', label: t.playerLabelId },
                  { id: 'team', label: t.playerLabelTeam },
                ] as const
              ).map((mode) => {
                const active = minimapLabelMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setMinimapLabelMode(mode.id)}
                    aria-pressed={active}
                    className={`flex-1 px-1.5 py-0.5 text-[10px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-cyan-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Minimap Legend & Fog Exploration Progress */}
          <div className="space-y-1 px-0.5 text-[10px] text-slate-400">
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-white inline-block" />
                  {t.you}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
                  Alfa
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                  Omega
                </span>
              </div>
              <span className="font-mono text-slate-300 tabular-nums truncate">
                {t.exploredLabel} {exploredPct}%
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-white/5">
              <span className="inline-flex items-center gap-1 text-red-300">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block ring-1 ring-red-400/70" />
                {t.filterSos}
              </span>
              <span className="inline-flex items-center gap-1 text-blue-300">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                {t.filterTactical}
              </span>
              <span className="inline-flex items-center gap-1 text-yellow-300">
                <span className="w-2 h-2 rounded-full border border-dashed border-yellow-400 bg-yellow-400/40 inline-block" />
                {t.filterDecoy}
              </span>
            </div>
          </div>
        </div>

        {killFeed.length > 0 && (
          <div className="space-y-1 text-[11px] font-mono">
            {killFeed.map((k) => (
              <div
                key={k.id}
                className="bg-[#0B0F17]/90 border border-white/10 rounded-md px-2.5 py-1 flex items-center gap-1.5"
              >
                <span className={k.killerTeam === 'alpha' ? 'text-cyan-400' : 'text-amber-400'}>
                  {k.killerName}
                </span>
                <span className="text-slate-500">→</span>
                <span className={k.victimTeam === 'alpha' ? 'text-cyan-300' : 'text-amber-300'}>
                  {k.victimName}
                </span>
              </div>
            ))}
          </div>
        )}

        {beaconFeed.length > 0 && (
          <div className="space-y-1 max-w-xs">
            {beaconFeed.map((b) => (
              <div
                key={b.id}
                className="bg-[#0B0F17]/90 border border-amber-500/30 rounded-md px-2.5 py-1.5 text-[11px]"
              >
                <div className="flex items-center justify-between gap-2 font-medium text-amber-300">
                  <span className="inline-flex items-center gap-1.5 truncate">
                    <Radio className="w-3 h-3 shrink-0" />
                    <span>{b.playerName}</span>
                  </span>
                  <span className="font-mono text-[10px] text-cyan-300 shrink-0">{b.cipherType}</span>
                </div>
                <div className="font-mono text-[11px] text-slate-100 truncate mt-0.5">{b.cipherText}</div>
                <div className="font-mono text-[10px] text-amber-400/80 truncate">{b.morse}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Self Fluttering Broadcast Echo (1st-person confirmation when emitting) */}
      {selfFlutterEcho && (
        <div className="absolute top-32 left-1/2 -translate-x-1/2 z-10 pointer-events-none animate-bounce bg-[#0B0F17]/95 border border-amber-400/50 rounded-xl px-4 py-2 text-center shadow-xl">
          <div className="text-[10px] font-mono text-cyan-300">
            {callsign} · {selfFlutterEcho.cipherType}
          </div>
          <div className="font-mono text-xs font-semibold text-white mt-0.5">
            {selfFlutterEcho.cipherText}
          </div>
          <div className="font-mono text-[11px] text-amber-300">{selfFlutterEcho.morse}</div>
        </div>
      )}

      {/* Center Crosshair */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
        <div className="relative flex items-center justify-center">
          <Crosshair
            className={`w-6 h-6 transition-transform duration-75 ${
              showHitMarker ? 'text-rose-400 scale-125' : 'text-cyan-300/80'
            }`}
          />
        </div>
      </div>

      {/* Click-to-Lock Prompt when unlocked */}
      {!pointerLocked && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-10 pointer-events-none bg-[#0B0F17]/90 border border-white/15 rounded-lg px-4 py-2 text-xs text-slate-200 text-center">
          {t.clickPrompt}
        </div>
      )}

      {/* Respawn Notice */}
      {!selfStats.alive && (
        <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center bg-rose-950/35">
          <div className="bg-[#0B0F17]/95 border border-rose-500/40 rounded-xl px-6 py-4 text-center">
            <div className="font-display text-lg font-semibold text-rose-300">
              {t.taggedNotice}
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Bottom Control Dock */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center max-w-[94vw]">
        <button
          type="button"
          onClick={() => setHudCollapsed((v) => !v)}
          className="mb-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#0B0F17]/90 border border-white/15 text-[11px] text-slate-300 hover:text-white cursor-pointer"
        >
          {hudCollapsed ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          <span>{hudCollapsed ? t.showHud : t.hideHud}</span>
        </button>

        {!hudCollapsed && (
          <div className="bg-[#0B0F17]/95 border border-white/15 rounded-xl px-4 py-3 flex flex-wrap items-center justify-center gap-4">
            {/* Health & Shield */}
            <div className="flex items-center gap-3 tabular-nums">
              <div className="space-y-1 w-24">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>HP</span>
                  <span className="font-mono text-emerald-400">{selfStats.health}</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-400" style={{ width: `${selfStats.health}%` }} />
                </div>
              </div>
              <div className="space-y-1 w-24">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <Shield className="w-2.5 h-2.5 text-cyan-400" />
                    SHD
                  </span>
                  <span className="font-mono text-cyan-400">{selfStats.shield}</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-400" style={{ width: `${(selfStats.shield / 50) * 100}%` }} />
                </div>
              </div>
            </div>

            <div className="h-6 w-px bg-white/10 hidden sm:block" />

            {/* Callsign Form */}
            <form onSubmit={handleJoinCallsign} className="flex items-center gap-1.5">
              <input
                type="text"
                value={callsign}
                onChange={(e) => setCallsign(e.target.value)}
                maxLength={16}
                className="w-28 rounded-md bg-[#111827] border border-white/15 px-2.5 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
              <button
                type="submit"
                className="px-2.5 py-1 rounded-md bg-[#182235] border border-white/10 text-xs text-slate-200 hover:border-cyan-500/50 cursor-pointer whitespace-nowrap"
              >
                {t.setCallsign}
              </button>
            </form>

            {/* Actions + Encrypted Morse Broadcaster */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSwitchTeam}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#182235] border border-white/10 text-slate-200 hover:border-cyan-500/50 cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>
                  {selfStats.team === 'alpha' ? t.teamAlpha : t.teamOmega}
                </span>
              </button>

              <div className="flex items-center gap-1.5 bg-[#111827] border border-white/15 rounded-lg p-1">
                <input
                  type="text"
                  value={beaconDraft}
                  onChange={(e) => setBeaconDraft(e.target.value)}
                  maxLength={28}
                  placeholder={t.secretMsgPlaceholder}
                  className="w-28 sm:w-36 bg-transparent px-2 py-1 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none"
                />
                <select
                  value={arenaCipher}
                  onChange={(e) => setArenaCipher(e.target.value as ArenaCipherMode)}
                  className="bg-[#0A0E17] border border-white/10 rounded px-1.5 py-1 text-[11px] text-cyan-300 focus:outline-none"
                >
                  <option value="caesar">Caesar +7</option>
                  <option value="vigenere">Vigenère</option>
                  <option value="atbash">Atbash</option>
                  <option value="none">Morse</option>
                </select>
                <select
                  value={beaconCategory}
                  onChange={(e) => setBeaconCategory(e.target.value as BeaconCategory)}
                  aria-label={t.beaconTypeAria}
                  className="bg-[#0A0E17] border border-white/10 rounded px-1.5 py-1 text-[11px] text-amber-300 focus:outline-none"
                >
                  <option value="tactical">{t.filterTactical}</option>
                  <option value="sos">{t.filterSos}</option>
                  <option value="distraction">{t.filterDecoy}</option>
                </select>
                <button
                  type="button"
                  onClick={() => broadcastMorseBeacon()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400 cursor-pointer whitespace-nowrap"
                >
                  <Send className="w-3 h-3" />
                  <span>{t.sendBeaconBtn}</span>
                </button>
              </div>

              {onToggleVoice && voiceSupported && (
                <button
                  type="button"
                  onClick={onToggleVoice}
                  title={t.voiceTooltip}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                    voiceListening
                      ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-semibold'
                      : 'bg-[#182235] border-white/10 text-slate-200 hover:border-cyan-500/50'
                  }`}
                >
                  {voiceListening ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                  <span>{voiceListening ? t.voiceOn : t.voiceOff}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
