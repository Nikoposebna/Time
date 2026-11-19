import React, { useCallback, useEffect, useState } from 'react';
import {
  Blocks,
  CheckCircle2,
  Cpu,
  Download,
  Pickaxe,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Volume2,
} from 'lucide-react';
import {
  applyCipher,
  CipherAlgorithm,
  sha256Hex,
  textToMorse,
} from '../utils/morseAndCrypto';
import { audioEngine } from '../utils/audioEngine';
import { AppLanguage, UI_TRANSLATIONS } from '../i18n/translations';

export interface SignalBlock {
  index: number;
  timestamp: string;
  sender: string;
  payload: string;
  cipherTag: string;
  morse: string;
  difficulty: number;
  nonce: number;
  prevHash: string;
  hash: string;
}

interface VerifiedBlockStatus {
  valid: boolean;
  computedHash: string;
  hashMatches: boolean;
  powMatches: boolean;
  linkMatches: boolean;
}

interface BlockchainLedgerProps {
  lang: AppLanguage;
  currentMorseMessage: string;
  onSendToArenaBeacon: (plaintext: string, morse: string, autoSend?: boolean) => void;
  onSendCipherToAi: (payload: string) => void;
}

type BlockCipherOption = 'none' | 'caesar' | 'vigenere' | 'atbash' | 'xor_hex';

const STORAGE_KEY = 'morzekripto_blockchain_v1';
const GENESIS_PREV = '0'.repeat(64);

function buildBlockCanonicalInput(
  block: Omit<SignalBlock, 'hash' | 'morse'>
): string {
  return `${block.index}|${block.timestamp}|${block.sender}|${block.payload}|${block.cipherTag}|${block.difficulty}|${block.prevHash}|${block.nonce}`;
}

async function mineSingleBlock(
  base: Omit<SignalBlock, 'hash' | 'nonce'>,
  onProgress?: (tested: number) => void
): Promise<SignalBlock> {
  const prefix = '0'.repeat(Math.max(1, Math.min(4, base.difficulty)));
  let nonce = 0;

  while (true) {
    const hash = await sha256Hex(buildBlockCanonicalInput({ ...base, nonce }));
    if (hash.startsWith(prefix)) {
      onProgress?.(nonce + 1);
      return { ...base, nonce, hash };
    }
    nonce++;
    if (nonce % 250 === 0) {
      onProgress?.(nonce);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }
}

async function buildInitialChain(): Promise<SignalBlock[]> {
  const genesisBase: Omit<SignalBlock, 'hash' | 'nonce'> = {
    index: 0,
    timestamp: '2026-11-18T00:00:00.000Z',
    sender: 'GENESIS-NODE',
    payload: 'MORZEKRIPTO ROOT LEDGER INITIALIZED',
    cipherTag: 'PLAIN',
    morse: textToMorse('MORZEKRIPTO ROOT LEDGER INITIALIZED'),
    difficulty: 2,
    prevHash: GENESIS_PREV,
  };
  const genesis = await mineSingleBlock(genesisBase);

  const encryptedSample = applyCipher('ALFA SEKTOR POTVRDA', 'caesar', 'encrypt', '7');
  const block1Base: Omit<SignalBlock, 'hash' | 'nonce'> = {
    index: 1,
    timestamp: '2026-11-18T00:05:00.000Z',
    sender: 'OP-ALFA-01',
    payload: encryptedSample,
    cipherTag: 'CAESAR (+7)',
    morse: textToMorse(encryptedSample),
    difficulty: 2,
    prevHash: genesis.hash,
  };
  const block1 = await mineSingleBlock(block1Base);

  return [genesis, block1];
}

export const BlockchainLedger: React.FC<BlockchainLedgerProps> = ({
  lang,
  currentMorseMessage,
  onSendToArenaBeacon,
  onSendCipherToAi,
}) => {
  const t = UI_TRANSLATIONS[lang].blockchain;

  const [blocks, setBlocks] = useState<SignalBlock[]>([]);
  const [statuses, setStatuses] = useState<VerifiedBlockStatus[]>([]);
  const [mining, setMining] = useState<boolean>(false);
  const [testedHashes, setTestedHashes] = useState<number>(0);

  // New block composer state
  const [sender, setSender] = useState<string>('OP-ALFA-01');
  const [draftPayload, setDraftPayload] = useState<string>(currentMorseMessage || 'SOS SEKTOR ALFA');
  const [cipherChoice, setCipherChoice] = useState<BlockCipherOption>('vigenere');
  const [cipherKey, setCipherKey] = useState<string>('SOLARIS');
  const [difficulty, setDifficulty] = useState<number>(2);

  const verifyAllBlocks = useCallback(async (chain: SignalBlock[]) => {
    const result: VerifiedBlockStatus[] = [];
    let chainBrokenUpToHere = false;

    for (let i = 0; i < chain.length; i++) {
      const b = chain[i];
      const expectedPrev = i === 0 ? GENESIS_PREV : chain[i - 1].hash;
      const linkMatches = b.prevHash === expectedPrev && !chainBrokenUpToHere;
      const computedHash = await sha256Hex(buildBlockCanonicalInput(b));
      const hashMatches = computedHash === b.hash;
      const powMatches = computedHash.startsWith('0'.repeat(Math.max(1, Math.min(4, b.difficulty))));
      const valid = linkMatches && hashMatches && powMatches;
      if (!valid) chainBrokenUpToHere = true;
      result.push({
        valid,
        computedHash,
        hashMatches,
        powMatches,
        linkMatches,
      });
    }
    setStatuses(result);
  }, []);

  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            if (!active) return;
            setBlocks(parsed);
            await verifyAllBlocks(parsed);
            return;
          }
        }
      } catch {
        // Fallback to genesis chain
      }
      const seeded = await buildInitialChain();
      if (!active) return;
      setBlocks(seeded);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      } catch {
        // Ignore storage limits
      }
      await verifyAllBlocks(seeded);
    };
    void init();
    return () => {
      active = false;
    };
  }, [verifyAllBlocks]);

  const persistChain = (next: SignalBlock[]) => {
    setBlocks(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage limits
    }
    void verifyAllBlocks(next);
  };

  const handleMineNewBlock = async () => {
    const rawText = draftPayload.trim();
    if (!rawText || mining || blocks.length === 0) return;

    setMining(true);
    setTestedHashes(0);
    try {
      let sealedPayload = rawText.toUpperCase();
      let cipherTag = 'PLAIN';
      if (cipherChoice !== 'none') {
        const alg = cipherChoice as CipherAlgorithm;
        sealedPayload = applyCipher(rawText, alg, 'encrypt', cipherKey);
        cipherTag =
          cipherChoice === 'atbash'
            ? 'ATBASH'
            : `${cipherChoice.toUpperCase()} (${cipherKey || 'DEFAULT'})`;
      }
      const morse = textToMorse(sealedPayload);
      const lastBlock = blocks[blocks.length - 1];
      const mined = await mineSingleBlock(
        {
          index: lastBlock.index + 1,
          timestamp: new Date().toISOString(),
          sender: sender.trim() || 'NODE-01',
          payload: sealedPayload,
          cipherTag,
          morse,
          difficulty,
          prevHash: lastBlock.hash,
        },
        (count) => setTestedHashes(count)
      );

      const next = [...blocks, mined];
      persistChain(next);
    } finally {
      setMining(false);
    }
  };

  const handleTamperPayload = (blockIndex: number, nextPayload: string) => {
    const next = blocks.map((b, idx) =>
      idx === blockIndex
        ? {
            ...b,
            payload: nextPayload,
            morse: textToMorse(nextPayload),
          }
        : b
    );
    persistChain(next);
  };

  const handleRemineChain = async () => {
    if (mining || blocks.length === 0) return;
    setMining(true);
    setTestedHashes(0);
    try {
      const rebuilt: SignalBlock[] = [];
      let totalTested = 0;
      for (let i = 0; i < blocks.length; i++) {
        const current = blocks[i];
        const prevHash = i === 0 ? GENESIS_PREV : rebuilt[i - 1].hash;
        const expectedHash = await sha256Hex(
          buildBlockCanonicalInput({ ...current, prevHash })
        );
        const alreadyValid =
          current.prevHash === prevHash &&
          current.hash === expectedHash &&
          expectedHash.startsWith('0'.repeat(Math.max(1, Math.min(4, current.difficulty))));

        if (alreadyValid) {
          rebuilt.push(current);
        } else {
          const mined = await mineSingleBlock(
            {
              index: current.index,
              timestamp: current.timestamp,
              sender: current.sender,
              payload: current.payload,
              cipherTag: current.cipherTag,
              morse: textToMorse(current.payload),
              difficulty: current.difficulty,
              prevHash,
            },
            (count) => setTestedHashes(totalTested + count)
          );
          totalTested += mined.nonce + 1;
          rebuilt.push(mined);
        }
      }
      persistChain(rebuilt);
    } finally {
      setMining(false);
    }
  };

  const handleResetChain = async () => {
    if (mining) return;
    setMining(true);
    try {
      const seeded = await buildInitialChain();
      persistChain(seeded);
    } finally {
      setMining(false);
    }
  };

  const isChainValid = statuses.length > 0 && statuses.every((s) => s.valid);

  return (
    <div className="space-y-6">
      {/* Header & Chain Audit Status */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <Blocks className="w-4 h-4" />
            <span>SHA-256 Proof-of-Work</span>
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-white">
            {t.title}
          </h2>
          <p className="mt-1.5 text-sm text-slate-400 max-w-2xl">{t.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium tabular-nums ${
              isChainValid
                ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300'
                : 'bg-rose-500/15 border-rose-500/45 text-rose-300'
            }`}
          >
            {isChainValid ? (
              <ShieldCheck className="w-4 h-4 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 shrink-0" />
            )}
            <span>{isChainValid ? t.chainValidTitle : t.chainBrokenTitle}</span>
            <span className="font-mono text-[11px] opacity-80">
              ({blocks.length} {t.blocksCount})
            </span>
          </div>

          {!isChainValid && (
            <button
              type="button"
              onClick={() => void handleRemineChain()}
              disabled={mining}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-400 text-slate-950 hover:bg-amber-300 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${mining ? 'animate-spin' : ''}`} />
              <span>{t.remineChainBtn}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleResetChain()}
            disabled={mining}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#111827] border border-white/10 text-slate-300 hover:border-white/25 hover:text-white disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.resetChainBtn}</span>
          </button>
        </div>
      </div>

      {/* Main 12-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Block Composer & PoW Miner */}
        <div className="lg:col-span-5 bg-[#111827] border border-white/10 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-base font-semibold text-white flex items-center gap-2">
              <Pickaxe className="w-4 h-4 text-cyan-400" />
              <span>{t.newBlockTitle}</span>
            </h3>
            <button
              type="button"
              onClick={() => setDraftPayload(currentMorseMessage || 'SOS SEKTOR ALFA')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#0A0E17] border border-white/10 text-cyan-300 hover:border-cyan-500/50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3 h-3" />
              <span>{t.loadMorseBtn}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">{t.senderLabel}</label>
              <input
                type="text"
                value={sender}
                onChange={(e) => setSender(e.target.value)}
                maxLength={20}
                className="w-full rounded-lg bg-[#0A0E17] border border-white/10 px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">{t.difficultyLabel}</label>
              <div className="grid grid-cols-4 gap-1 p-0.5 bg-[#0A0E17] border border-white/10 rounded-lg">
                {[1, 2, 3, 4].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={`py-1.5 text-xs font-mono rounded-md transition-colors cursor-pointer tabular-nums ${
                      difficulty === d
                        ? 'bg-cyan-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {'0'.repeat(d)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">{t.payloadLabel}</label>
            <textarea
              value={draftPayload}
              onChange={(e) => setDraftPayload(e.target.value)}
              rows={3}
              placeholder={t.payloadPlaceholder}
              className="w-full rounded-lg bg-[#0A0E17] border border-white/10 p-3 text-sm font-mono text-amber-300 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">{t.cipherLabel}</label>
              <select
                value={cipherChoice}
                onChange={(e) => {
                  const next = e.target.value as BlockCipherOption;
                  setCipherChoice(next);
                  if (next === 'caesar') setCipherKey('7');
                  else if (next === 'vigenere') setCipherKey('SOLARIS');
                  else if (next === 'xor_hex') setCipherKey('KOD99');
                  else setCipherKey('');
                }}
                className="w-full rounded-lg bg-[#0A0E17] border border-white/10 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                <option value="none">{t.noCipher}</option>
                <option value="caesar">Caesar Shift</option>
                <option value="vigenere">Vigenère</option>
                <option value="atbash">Atbash</option>
                <option value="xor_hex">XOR + Hex</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">{t.keyLabel}</label>
              <input
                type="text"
                value={cipherChoice === 'none' || cipherChoice === 'atbash' ? '—' : cipherKey}
                disabled={cipherChoice === 'none' || cipherChoice === 'atbash'}
                onChange={(e) => setCipherKey(e.target.value)}
                className="w-full rounded-lg bg-[#0A0E17] border border-white/10 px-3 py-2 text-sm font-mono text-cyan-300 disabled:opacity-45 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleMineNewBlock()}
            disabled={mining || !draftPayload.trim()}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Pickaxe className={`w-4 h-4 ${mining ? 'animate-spin' : ''}`} />
            <span>{mining ? t.miningBtn : t.mineBtn}</span>
          </button>

          {testedHashes > 0 && (
            <div className="text-xs font-mono text-slate-400 flex items-center justify-between pt-2 border-t border-white/10 tabular-nums">
              <span>{t.liveHashesLabel}:</span>
              <span className="text-cyan-300">{testedHashes.toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Right: Immutable Block Ledger */}
        <div className="lg:col-span-7 space-y-4">
          <p className="text-xs text-slate-400">{t.tamperHint}</p>

          {[...blocks].reverse().map((block) => {
            const st = statuses[block.index];
            const valid = st ? st.valid : true;
            const displayHash = st?.computedHash || block.hash;

            return (
              <div
                key={`${block.index}-${block.timestamp}`}
                className={`rounded-xl border p-5 space-y-3.5 transition-colors ${
                  valid
                    ? 'bg-[#111827] border-white/10'
                    : 'bg-rose-950/20 border-rose-500/50'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-[#0A0E17] border border-cyan-500/30 font-mono text-xs font-semibold text-cyan-300 tabular-nums">
                      {block.index === 0 ? t.genesisTag : `${t.blockPrefix} #${block.index}`}
                    </span>
                    <span className="font-mono text-xs text-slate-300">{block.sender}</span>
                    <span className="px-1.5 py-0.5 rounded bg-[#0A0E17] border border-white/10 font-mono text-[10px] text-amber-300">
                      {block.cipherTag}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs tabular-nums">
                    <span className="font-mono text-slate-400">
                      {t.nonceLabel}: <strong className="text-slate-200">{block.nonce}</strong>
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-mono text-[11px] font-semibold ${
                        valid
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                      }`}
                    >
                      {valid ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <ShieldAlert className="w-3 h-3" />
                      )}
                      {valid ? t.blockValid : t.blockInvalid}
                    </span>
                  </div>
                </div>

                {/* Editable Payload for Live Cryptographic Tamper Verification */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{t.payloadLabel}</span>
                    <span className="font-mono tabular-nums">
                      {new Date(block.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={block.payload}
                    onChange={(e) => handleTamperPayload(block.index, e.target.value)}
                    className={`w-full rounded-lg bg-[#0A0E17] border px-3 py-2 text-sm font-mono focus:outline-none ${
                      valid
                        ? 'border-white/10 text-white focus:border-cyan-500'
                        : 'border-rose-500/50 text-rose-200 focus:border-rose-400'
                    }`}
                  />
                </div>

                {/* Morse Signature */}
                {block.morse && (
                  <div className="rounded-lg bg-[#0A0E17] border border-white/5 px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] text-slate-500">{t.morseSignalLabel}</div>
                      <div className="font-mono text-xs text-amber-300 truncate">{block.morse}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void audioEngine.playMorseSequence(block.morse, { wpm: 18 })}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#111827] border border-white/10 text-[11px] text-amber-300 hover:border-amber-400/50 cursor-pointer shrink-0"
                    >
                      <Volume2 className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Previous Hash & Computed SHA-256 Hash */}
                <div className="grid grid-cols-1 gap-1.5 font-mono text-[11px]">
                  <div className="flex items-center gap-2 bg-[#0A0E17] border border-white/5 rounded px-2.5 py-1.5">
                    <span className="text-slate-500 shrink-0 w-24">{t.prevHashLabel}:</span>
                    <span
                      className={`truncate ${
                        st && !st.linkMatches ? 'text-rose-400' : 'text-slate-400'
                      }`}
                    >
                      {block.prevHash}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 bg-[#0A0E17] border border-white/5 rounded px-2.5 py-1.5">
                    <span className="text-slate-500 shrink-0 w-24">{t.hashLabel}:</span>
                    <span className={`truncate ${valid ? 'text-cyan-300' : 'text-rose-400'}`}>
                      {displayHash}
                    </span>
                  </div>
                </div>

                {/* Cross-module actions */}
                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onSendCipherToAi(block.payload)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-[#0A0E17] border border-white/10 text-slate-300 hover:border-cyan-500/50 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{t.sendAiBtn}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onSendToArenaBeacon(block.payload, block.morse || textToMorse(block.payload), true)
                    }
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>{t.sendArenaBtn}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
