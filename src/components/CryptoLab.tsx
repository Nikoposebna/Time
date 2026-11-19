import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Unlock, Volume2, Copy, Check, ArrowRight, BarChart3, Info, Radio } from 'lucide-react';
import {
  CIPHER_CATALOG,
  CipherAlgorithm,
  applyCipher,
  textToMorse,
  analyzeFrequencies,
} from '../utils/morseAndCrypto';
import { audioEngine } from '../utils/audioEngine';
import { AppLanguage, UI_TRANSLATIONS } from '../i18n/translations';

interface CryptoLabProps {
  lang: AppLanguage;
  onSendCipherToAi: (payload: string) => void;
  onSendToArenaBeacon?: (plaintext: string, morse: string, autoSend?: boolean) => void;
  externalInputSeed?: { id: number; text: string; mode?: 'encrypt' | 'decrypt' } | null;
  voiceCommandSignal?: { id: number; action: 'encrypt' | 'decrypt' | 'beacon' } | null;
}

export const CryptoLab: React.FC<CryptoLabProps> = ({
  lang,
  onSendCipherToAi,
  onSendToArenaBeacon,
  externalInputSeed,
  voiceCommandSignal,
}) => {
  const [algorithm, setAlgorithm] = useState<CipherAlgorithm>('vigenere');
  const [mode, setMode] = useState<'encrypt' | 'decrypt'>('encrypt');
  const [cipherKey, setCipherKey] = useState<string>('SOLARIS');
  const [inputText, setInputText] = useState<string>('KONVOJ KRECE U PONOC PREMA ALFA SEKTORU');
  const [chainMorse, setChainMorse] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [tooltipOpen, setTooltipOpen] = useState<boolean>(false);
  const [voiceHighlight, setVoiceHighlight] = useState<'encrypt' | 'decrypt' | null>(null);

  const activeMeta = useMemo(
    () => CIPHER_CATALOG.find((c) => c.id === algorithm) ?? CIPHER_CATALOG[0],
    [algorithm]
  );

  const handleSelectAlgorithm = (id: CipherAlgorithm) => {
    setAlgorithm(id);
    const meta = CIPHER_CATALOG.find((c) => c.id === id);
    if (meta) {
      setCipherKey(meta.defaultKey);
    }
  };

  const transformedText = useMemo(
    () => applyCipher(inputText, algorithm, mode, cipherKey),
    [inputText, algorithm, mode, cipherKey]
  );

  const chainedMorseOutput = useMemo(
    () => (chainMorse ? textToMorse(transformedText) : ''),
    [transformedText, chainMorse]
  );

  const frequencies = useMemo(
    () => analyzeFrequencies(mode === 'encrypt' ? transformedText : inputText),
    [transformedText, inputText, mode]
  );

  const latestDataRef = useRef({ transformedText, inputText, chainedMorseOutput });
  latestDataRef.current = { transformedText, inputText, chainedMorseOutput };

  useEffect(() => {
    if (!externalInputSeed) return;
    if (externalInputSeed.text.trim()) {
      setInputText(externalInputSeed.text);
    }
    if (externalInputSeed.mode) {
      setMode(externalInputSeed.mode);
    }
  }, [externalInputSeed]);

  useEffect(() => {
    if (!voiceCommandSignal) return;
    if (voiceCommandSignal.action === 'encrypt') {
      setMode('encrypt');
      setVoiceHighlight('encrypt');
      const timer = window.setTimeout(() => setVoiceHighlight(null), 1500);
      return () => window.clearTimeout(timer);
    }
    if (voiceCommandSignal.action === 'decrypt') {
      setMode('decrypt');
      setVoiceHighlight('decrypt');
      const timer = window.setTimeout(() => setVoiceHighlight(null), 1500);
      return () => window.clearTimeout(timer);
    }
    if (voiceCommandSignal.action === 'beacon') {
      const payload = latestDataRef.current.transformedText || latestDataRef.current.inputText;
      const morse = latestDataRef.current.chainedMorseOutput || textToMorse(payload);
      onSendToArenaBeacon?.(payload, morse, true);
    }
  }, [voiceCommandSignal, onSendToArenaBeacon]);

  const handleCopy = async () => {
    const target = chainMorse && chainedMorseOutput ? `${transformedText}\n\n${chainedMorseOutput}` : transformedText;
    await navigator.clipboard.writeText(target);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const t = UI_TRANSLATIONS[lang].crypto;
  const activeLocale = activeMeta.locales[lang];

  return (
    <div className="space-y-8">
      {/* Section Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between border-b border-white/10 pb-6">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-white">
            {t.title}
          </h2>
          <p className="mt-1.5 text-sm text-slate-400 max-w-2xl">{t.subtitle}</p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#111827] border border-white/10 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setMode('encrypt')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mode === 'encrypt'
                ? 'bg-cyan-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{t.encrypt}</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('decrypt')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mode === 'decrypt'
                ? 'bg-cyan-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Unlock className="w-3.5 h-3.5" />
            <span>{t.decrypt}</span>
          </button>
        </div>
      </div>

      {/* Algorithm Selector Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
        {CIPHER_CATALOG.map((cipher) => {
          const active = cipher.id === algorithm;
          const loc = cipher.locales[lang];
          return (
            <button
              key={cipher.id}
              type="button"
              onClick={() => handleSelectAlgorithm(cipher.id)}
              className={`text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                active
                  ? 'bg-[#182235] border-cyan-500/70 text-white'
                  : 'bg-[#111827] border-white/10 text-slate-300 hover:border-white/25'
              }`}
            >
              <div className="text-xs font-semibold truncate">{loc.label}</div>
              <div className="text-[11px] text-slate-400 mt-1 truncate">
                {cipher.requiresKey ? (cipher.keyType === 'number' ? t.numKey : t.abcKey) : t.keyless}
              </div>
            </button>
          );
        })}
      </div>

      {/* Workbench Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 bg-[#111827] border border-white/10 rounded-xl p-6 space-y-6">
          {/* Active Cipher Info & Key */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/10">
            <div>
              <div
                className="relative inline-flex items-center gap-2 group"
                onMouseEnter={() => setTooltipOpen(true)}
                onMouseLeave={() => setTooltipOpen(false)}
              >
                <button
                  type="button"
                  aria-describedby="active-cipher-tooltip"
                  onFocus={() => setTooltipOpen(true)}
                  onBlur={() => setTooltipOpen(false)}
                  className="inline-flex items-center gap-2 text-left rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 cursor-help"
                >
                  <h3 className="font-display text-base font-semibold text-white underline decoration-dotted decoration-cyan-500/50 underline-offset-4 group-hover:text-cyan-300 transition-colors">
                    {activeLocale.label}
                  </h3>
                  <Info className="w-4 h-4 text-cyan-400 shrink-0" />
                </button>

                {/* Tooltip Popover */}
                <div
                  id="active-cipher-tooltip"
                  role="tooltip"
                  className={`absolute left-0 top-full mt-2.5 z-30 w-80 max-w-[82vw] rounded-xl bg-[#0A0E17] border border-cyan-500/35 p-4 shadow-2xl transition-all duration-150 ${
                    tooltipOpen
                      ? 'opacity-100 translate-y-0 pointer-events-auto'
                      : 'opacity-0 -translate-y-1 pointer-events-none'
                  }`}
                >
                  <div className="text-xs text-slate-400 flex items-center gap-1.5">
                    <span>{activeLocale.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-cyan-300">
                      {activeMeta.requiresKey ? t.requiresKey : t.keyless}
                    </span>
                  </div>
                  <div className="font-display text-sm font-semibold text-white mt-1">
                    {activeLocale.label}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed mt-1.5">
                    {activeLocale.tooltip}
                  </p>
                  <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">{t.example}</span>
                    <span className="font-mono text-amber-300">{activeMeta.example}</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{activeLocale.description}</p>
            </div>

            {activeMeta.requiresKey && (
              <div className="flex items-center gap-2.5 shrink-0">
                <label className="text-xs text-slate-400 whitespace-nowrap">{t.keyLabel}</label>
                <input
                  type={activeMeta.keyType === 'number' ? 'number' : 'text'}
                  min={activeMeta.keyType === 'number' ? 1 : undefined}
                  max={activeMeta.keyType === 'number' ? 25 : undefined}
                  value={cipherKey}
                  onChange={(e) => setCipherKey(e.target.value)}
                  className="w-32 rounded-lg bg-[#0A0E17] border border-white/15 px-3 py-1.5 text-sm font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
                />
              </div>
            )}
          </div>

          {/* Input & Output Panes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-400">{t.inputLabel}</label>
                <span className="text-xs text-slate-500 tabular-nums">{inputText.length} ch</span>
              </div>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={5}
                className="w-full rounded-lg bg-[#0A0E17] border border-white/10 p-3.5 text-sm font-mono text-slate-100 focus:outline-none focus:border-cyan-500/70 resize-none"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-400">{t.outputLabel}</label>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? t.copied : t.copy}</span>
                </button>
              </div>
              <div
                className={`w-full min-h-[132px] rounded-lg bg-[#0A0E17] border p-3.5 text-sm font-mono text-cyan-300 break-all overflow-y-auto max-h-44 transition-colors duration-200 ${
                  voiceHighlight
                    ? 'border-cyan-400 ring-2 ring-cyan-400/30'
                    : 'border-white/10'
                }`}
              >
                {transformedText || <span className="text-slate-600">—</span>}
              </div>
              {voiceHighlight && (
                <div className="text-[11px] font-medium text-cyan-300">
                  {voiceHighlight === 'encrypt' ? t.voiceEncrypted : t.voiceDecrypted}
                </div>
              )}
            </div>
          </div>

          {/* Chained Morse Output */}
          <div className="pt-4 border-t border-white/10 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2.5 text-xs font-medium text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={chainMorse}
                  onChange={(e) => setChainMorse(e.target.checked)}
                  className="rounded accent-amber-500 w-4 h-4"
                />
                <span>{t.chainLabel}</span>
              </label>

              <div className="flex items-center gap-3">
                {chainMorse && chainedMorseOutput && (
                  <button
                    type="button"
                    onClick={() => void audioEngine.playMorseSequence(chainedMorseOutput, { wpm: 16 })}
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>{t.playMorse}</span>
                  </button>
                )}

                {onSendToArenaBeacon && transformedText && (
                  <button
                    type="button"
                    onClick={() =>
                      onSendToArenaBeacon(
                        transformedText,
                        chainedMorseOutput || textToMorse(transformedText),
                        true
                      )
                    }
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-[#182235] text-amber-300 border border-amber-500/30 hover:border-amber-400 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>{t.sendBeacon}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() =>
                    onSendCipherToAi(chainMorse && chainedMorseOutput ? chainedMorseOutput : transformedText)
                  }
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-[#182235] text-cyan-300 border border-white/10 hover:border-cyan-500/50 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <span>{t.sendAi}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {chainMorse && (
              <div className="rounded-lg bg-[#0A0E17] border border-white/10 p-3.5 font-mono text-xs text-amber-300 tracking-wider leading-relaxed break-words max-h-28 overflow-y-auto">
                {chainedMorseOutput || '—'}
              </div>
            )}
          </div>
        </div>

        {/* Right: Cryptanalysis Frequency Distribution */}
        <div className="lg:col-span-4 bg-[#111827] border border-white/10 rounded-xl p-6 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-white">{t.freqTitle}</h3>
              <BarChart3 className="w-4 h-4 text-slate-400" />
            </div>
            <p className="text-xs text-slate-400 mt-1">{t.freqSubtitle}</p>
          </div>

          <div className="space-y-2.5 flex-1 flex flex-col justify-center">
            {frequencies.length === 0 ? (
              <div className="text-xs text-slate-500 text-center py-8">{t.freqEmpty}</div>
            ) : (
              frequencies.map((item) => (
                <div key={item.char} className="grid grid-cols-12 items-center gap-2 text-xs">
                  <span className="col-span-2 font-mono font-semibold text-slate-200">{item.char}</span>
                  <div className="col-span-7 h-2 rounded-full bg-[#0A0E17] overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 rounded-full"
                      style={{ width: `${Math.max(6, Math.min(100, item.pct * 2.5))}%` }}
                    />
                  </div>
                  <span className="col-span-3 text-right font-mono tabular-nums text-slate-400">
                    {item.count} ({item.pct}%)
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="pt-3 border-t border-white/10 text-xs text-slate-400 flex items-center justify-between tabular-nums">
            <span>{t.totalChars}</span>
            <span className="font-mono text-slate-200">{transformedText.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

