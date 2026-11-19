import React, { useEffect, useRef, useState } from 'react';
import { Volume2, Square, Radio, Trash2, Send, Copy, Check } from 'lucide-react';
import { MORSE_MAP, textToMorse, morseToText, normalizeForMorse } from '../utils/morseAndCrypto';
import { audioEngine, MorseWaveform } from '../utils/audioEngine';
import { MorseOscillator } from './MorseOscillator';
import { AppLanguage, UI_TRANSLATIONS } from '../i18n/translations';

interface MorseStudioProps {
  lang: AppLanguage;
  morseMessage: string;
  onMorseMessageChange: (text: string) => void;
  onSendToArenaBeacon: (plaintext: string, morse: string) => void;
}

const QUICK_MORSE_KEYS = Object.keys(MORSE_MAP).slice(0, 36); // A-Z + 0-9

export const MorseStudio: React.FC<MorseStudioProps> = ({
  lang,
  morseMessage,
  onMorseMessageChange,
  onSendToArenaBeacon,
}) => {
  const [direction, setDirection] = useState<'text-to-morse' | 'morse-to-text'>('text-to-morse');
  const [rawMorseInput, setRawMorseInput] = useState<string>(() => textToMorse(morseMessage));
  const [wpm, setWpm] = useState<number>(16);
  const [frequency, setFrequency] = useState<number>(680);
  const [waveform, setWaveform] = useState<MorseWaveform>('sine');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [beaconLit, setBeaconLit] = useState<boolean>(false);
  const [activeCharIdx, setActiveCharIdx] = useState<number>(-1);
  const [copied, setCopied] = useState<boolean>(false);

  // Telegraph key state
  const [telegraphBuffer, setTelegraphBuffer] = useState<string>('');
  const [isKeyDown, setIsKeyDown] = useState<boolean>(false);
  const [spaceArmed, setSpaceArmed] = useState<boolean>(false);
  const keyDownAtRef = useRef<number>(0);
  const lastReleaseAtRef = useRef<number>(0);
  const charGapTimerRef = useRef<number | null>(null);
  const wordGapTimerRef = useRef<number | null>(null);

  const computedMorse = direction === 'text-to-morse' ? textToMorse(morseMessage) : rawMorseInput;
  const computedText = direction === 'text-to-morse' ? morseMessage : morseToText(rawMorseInput);

  useEffect(() => {
    if (direction === 'text-to-morse') {
      setRawMorseInput(textToMorse(morseMessage));
    }
  }, [morseMessage, direction]);

  useEffect(() => {
    return () => {
      audioEngine.stopSequence();
      if (charGapTimerRef.current) clearTimeout(charGapTimerRef.current);
      if (wordGapTimerRef.current) clearTimeout(wordGapTimerRef.current);
    };
  }, []);

  const handlePlay = async () => {
    if (isPlaying) {
      audioEngine.stopSequence();
      setIsPlaying(false);
      setBeaconLit(false);
      setActiveCharIdx(-1);
      return;
    }
    if (!computedMorse.trim()) return;
    setIsPlaying(true);
    await audioEngine.playMorseSequence(computedMorse, {
      wpm,
      frequency,
      waveform,
      onPulse: (on, charIndex) => {
        setBeaconLit(on);
        setActiveCharIdx(charIndex);
      },
    });
    setIsPlaying(false);
    setBeaconLit(false);
    setActiveCharIdx(-1);
  };

  const pressTelegraphKey = () => {
    if (isKeyDown) return;
    if (charGapTimerRef.current) clearTimeout(charGapTimerRef.current);
    if (wordGapTimerRef.current) clearTimeout(wordGapTimerRef.current);

    setIsKeyDown(true);
    setBeaconLit(true);
    keyDownAtRef.current = performance.now();
    audioEngine.startTone(frequency, 0.16, waveform);
  };

  const releaseTelegraphKey = () => {
    if (!isKeyDown) return;
    setIsKeyDown(false);
    setBeaconLit(false);
    audioEngine.stopTone();

    const heldMs = performance.now() - keyDownAtRef.current;
    const symbol = heldMs >= 175 ? '-' : '.';
    lastReleaseAtRef.current = performance.now();

    setTelegraphBuffer((prev) => prev + symbol);

    charGapTimerRef.current = window.setTimeout(() => {
      setTelegraphBuffer((prev) => (prev.endsWith(' ') || prev.endsWith('/ ') ? prev : prev + ' '));
    }, 360);

    wordGapTimerRef.current = window.setTimeout(() => {
      setTelegraphBuffer((prev) => (prev.endsWith('/ ') ? prev : prev.trimEnd() + ' / '));
    }, 950);
  };

  useEffect(() => {
    if (!spaceArmed) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        pressTelegraphKey();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        releaseTelegraphKey();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  });

  const handleCopy = async () => {
    await navigator.clipboard.writeText(computedMorse);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const t = UI_TRANSLATIONS[lang].morse;

  return (
    <div className="space-y-8">
      {/* Header & Mode Segmented Switch */}
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
            onClick={() => setDirection('text-to-morse')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              direction === 'text-to-morse'
                ? 'bg-cyan-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            {t.textToMorse}
          </button>
          <button
            type="button"
            onClick={() => setDirection('morse-to-text')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              direction === 'morse-to-text'
                ? 'bg-cyan-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            {t.morseToText}
          </button>
        </div>
      </div>

      {/* Main Translator + Optical Beacon Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Bidirectional I/O */}
        <div className="lg:col-span-8 bg-[#111827] border border-white/10 rounded-xl p-6 flex flex-col justify-between gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Text Pane */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-400">{t.plainLabel}</label>
                <span className="text-xs text-slate-500 tabular-nums">
                  {normalizeForMorse(computedText).length} ch
                </span>
              </div>
              <textarea
                value={computedText}
                readOnly={direction === 'morse-to-text'}
                onChange={(e) => onMorseMessageChange(e.target.value)}
                rows={5}
                placeholder={t.placeholder}
                className="w-full rounded-lg bg-[#0A0E17] border border-white/10 p-3.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/70 resize-none font-mono"
              />
            </div>

            {/* Morse Pane */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-400">{t.morseLabel}</label>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? t.copied : t.copy}</span>
                </button>
              </div>
              {direction === 'morse-to-text' ? (
                <textarea
                  value={rawMorseInput}
                  onChange={(e) => setRawMorseInput(e.target.value)}
                  rows={5}
                  placeholder="... --- ... / .- .-.. ..-. .-"
                  className="w-full rounded-lg bg-[#0A0E17] border border-white/10 p-3.5 text-sm text-amber-300 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/70 resize-none font-mono tracking-wider"
                />
              ) : (
                <div className="w-full min-h-[132px] rounded-lg bg-[#0A0E17] border border-white/10 p-3.5 text-sm font-mono tracking-wider leading-relaxed break-words overflow-y-auto max-h-44">
                  {computedMorse ? (
                    computedMorse.split('').map((ch, idx) => (
                      <span
                        key={idx}
                        className={
                          idx === activeCharIdx
                            ? 'bg-amber-400 text-slate-950 font-bold px-0.5 rounded'
                            : ch === '.' || ch === '-'
                            ? 'text-amber-300'
                            : 'text-slate-500'
                        }
                      >
                        {ch}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-600">... --- ...</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Controls Row */}
          <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {t.speed}:{' '}
                  <strong className="text-slate-200 font-mono tabular-nums">{wpm} WPM</strong>
                </span>
                <input
                  type="range"
                  min={8}
                  max={28}
                  value={wpm}
                  onChange={(e) => setWpm(Number(e.target.value))}
                  className="w-24 accent-cyan-500 cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {t.tone}:{' '}
                  <strong className="text-slate-200 font-mono tabular-nums">{frequency} Hz</strong>
                </span>
                <input
                  type="range"
                  min={450}
                  max={880}
                  step={10}
                  value={frequency}
                  onChange={(e) => setFrequency(Number(e.target.value))}
                  className="w-24 accent-amber-500 cursor-pointer"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handlePlay}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isPlaying
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                    : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                }`}
              >
                {isPlaying ? <Square className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                <span>{isPlaying ? t.stop : t.play}</span>
              </button>

              <button
                type="button"
                onClick={() => onSendToArenaBeacon(computedText, computedMorse)}
                disabled={!computedMorse.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#182235] text-slate-200 border border-white/10 hover:border-cyan-500/50 hover:text-white transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 cursor-pointer"
              >
                <Send className="w-4 h-4 text-cyan-400" />
                <span>{t.sendArena}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Optical Laser Beacon & Telegraph Key */}
        <div className="lg:col-span-4 bg-[#111827] border border-white/10 rounded-xl p-6 flex flex-col justify-between gap-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-semibold text-white">{t.telegraphTitle}</h3>
              <p className="text-xs text-slate-400 mt-0.5">{t.telegraphHint}</p>
            </div>
            {/* Optical Signal Lamp */}
            <div
              aria-label="Optical Morse Signal Lamp"
              className={`w-10 h-10 rounded-full border transition-all duration-75 flex items-center justify-center shrink-0 ${
                beaconLit
                  ? 'bg-amber-400 border-amber-200 shadow-[0_0_24px_rgba(251,191,36,0.9)]'
                  : 'bg-[#0A0E17] border-white/15'
              }`}
            >
              <Radio className={`w-4 h-4 ${beaconLit ? 'text-slate-950' : 'text-slate-500'}`} />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onMouseDown={pressTelegraphKey}
              onMouseUp={releaseTelegraphKey}
              onMouseLeave={() => {
                if (isKeyDown) releaseTelegraphKey();
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                pressTelegraphKey();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                releaseTelegraphKey();
              }}
              className={`w-full py-6 rounded-xl border text-sm font-display font-semibold tracking-wider transition-transform select-none cursor-pointer ${
                isKeyDown
                  ? 'bg-amber-400 text-slate-950 border-amber-300 scale-[0.98]'
                  : 'bg-[#182235] text-slate-100 border-white/15 hover:border-amber-400/50'
              }`}
            >
              {t.holdKey}
            </button>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setSpaceArmed((v) => !v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                  spaceArmed
                    ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                    : 'bg-[#0A0E17] border-white/10 text-slate-400 hover:text-slate-200'
                }`}
              >
                {spaceArmed ? t.spaceActive : t.armSpace}
              </button>

              <button
                type="button"
                onClick={() => setTelegraphBuffer('')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-rose-300 bg-[#0A0E17] border border-white/10 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t.clear}</span>
              </button>
            </div>
          </div>

          <div className="bg-[#0A0E17] border border-white/10 rounded-lg p-3 space-y-1.5">
            <div className="text-xs font-mono text-amber-300 min-h-[20px] break-all">
              {telegraphBuffer || '· — ·'}
            </div>
            <div className="text-xs text-slate-400 flex items-center justify-between gap-2 pt-1 border-t border-white/5">
              <span>{t.decodedLive}</span>
              <span className="font-mono font-semibold text-cyan-300 truncate">
                {telegraphBuffer ? morseToText(telegraphBuffer) : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Morse Oscillator & Spectrum Analyzer */}
      <MorseOscillator
        lang={lang}
        frequency={frequency}
        waveform={waveform}
        isSignalActive={beaconLit}
        onWaveformChange={setWaveform}
      />

      {/* Interactive Morse Matrix */}
      <div className="bg-[#111827] border border-white/10 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-base font-semibold text-white">{t.matrixTitle}</h3>
          <span className="text-xs text-slate-400">{t.matrixHint}</span>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-9 lg:grid-cols-12 gap-2">
          {QUICK_MORSE_KEYS.map((char) => (
            <button
              key={char}
              type="button"
              onClick={() => {
                if (direction === 'text-to-morse') {
                  onMorseMessageChange(morseMessage + char);
                } else {
                  setRawMorseInput((prev) => (prev ? `${prev.trim()} ${MORSE_MAP[char]}` : MORSE_MAP[char]));
                }
                void audioEngine.playMorseSequence(MORSE_MAP[char], { wpm, frequency, waveform });
              }}
              className="group flex flex-col items-center justify-center py-2.5 px-2 rounded-lg bg-[#0A0E17] border border-white/10 hover:border-cyan-500/60 hover:bg-[#182235] transition-colors cursor-pointer"
            >
              <span className="font-display text-sm font-semibold text-slate-100 group-hover:text-cyan-300">
                {char}
              </span>
              <span className="font-mono text-xs text-amber-300/90 mt-0.5">{MORSE_MAP[char]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
