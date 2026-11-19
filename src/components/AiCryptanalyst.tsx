import React, { useEffect, useState } from 'react';
import {
  Cpu,
  HelpCircle,
  ShieldCheck,
  Volume2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Send,
  ChevronLeft,
  ChevronRight,
  Lock,
  Award,
  ArrowRight,
} from 'lucide-react';
import {
  applyCipher,
  applyCipherChain,
  CapabilityTierKey,
  CipherAlgorithm,
  CipherStep,
  clampChallengeLevel,
  getLevelProfile,
  maskCipherKey,
  textToMorse,
} from '../utils/morseAndCrypto';
import { audioEngine } from '../utils/audioEngine';
import { AppLanguage, UI_TRANSLATIONS } from '../i18n/translations';

interface AiAnalysisResult {
  detectedFormat: string;
  decodedPlaintext: string;
  morseRepresentation: string;
  confidencePercent: number;
  analysisSteps: string[];
  securityNote: string;
}

interface AiChallengeResult {
  level?: number;
  tier?: number;
  tierKey?: CapabilityTierKey;
  wpm?: number;
  xpReward?: number;
  title: string;
  briefing: string;
  plaintext: string;
  cipherSteps?: CipherStep[];
  cipherType: string;
  cipherKey: string;
  hint: string;
}

interface AiComposeResult {
  tacticalMessage: string;
  recommendedKey: string;
  protocolNote: string;
}

interface AiCryptanalystProps {
  lang: AppLanguage;
  externalInput: string;
  onUseMorseInStudio: (plaintext: string) => void;
  challengeLevel?: number;
  onChallengeLevelChange?: (level: number) => void;
  clearedLevels?: number[];
  onClearedLevelsChange?: (levels: number[]) => void;
  openChallengeSignal?: number;
}

export const AiCryptanalyst: React.FC<AiCryptanalystProps> = ({
  lang,
  externalInput,
  onUseMorseInStudio,
  challengeLevel: controlledLevel,
  onChallengeLevelChange,
  clearedLevels: controlledClearedLevels,
  onClearedLevelsChange,
  openChallengeSignal = 0,
}) => {
  const t = UI_TRANSLATIONS[lang].ai;
  const [subTab, setSubTab] = useState<'analyze' | 'challenge' | 'compose'>('analyze');

  // Analyze state
  const [analyzeInput, setAnalyzeInput] = useState<string>(
    '... --- ... / -- --- .-. --.. . --- ...- .- / ... .. ..-. .-. .-'
  );
  const [analyzeHint, setAnalyzeHint] = useState<string>('');
  const [analyzeLoading, setAnalyzeLoading] = useState<boolean>(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzeResult, setAnalyzeResult] = useState<AiAnalysisResult | null>(null);

  // Challenge state (Levels 1-99 Capability Assessment)
  const [internalLevel, setInternalLevel] = useState<number>(1);
  const [internalCleared, setInternalCleared] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem('morse_crypto_cleared_levels');
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr)
        ? arr.filter((n): n is number => typeof n === 'number' && n >= 1 && n <= 99)
        : [];
    } catch {
      return [];
    }
  });
  const challengeLevel = controlledLevel ?? internalLevel;
  const setChallengeLevel = (updater: number | ((prev: number) => number)) => {
    const next = typeof updater === 'function' ? updater(challengeLevel) : updater;
    const clamped = clampChallengeLevel(next);
    if (onChallengeLevelChange) {
      onChallengeLevelChange(clamped);
    } else {
      setInternalLevel(clamped);
    }
  };
  const clearedLevels = controlledClearedLevels ?? internalCleared;

  const [challengeLoading, setChallengeLoading] = useState<boolean>(false);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<AiChallengeResult | null>(null);
  const [challengeCiphertext, setChallengeCiphertext] = useState<string>('');
  const [challengeMorse, setChallengeMorse] = useState<string>('');
  const [showHint, setShowHint] = useState<boolean>(false);
  const [userAnswer, setUserAnswer] = useState<string>('');
  const [answerFeedback, setAnswerFeedback] = useState<'correct' | 'wrong' | null>(null);

  // Compose state
  const [composeTopic, setComposeTopic] = useState<string>(t.defaultComposeTopic);
  const [composeCipher, setComposeCipher] = useState<CipherAlgorithm>('vigenere');
  const [composeLoading, setComposeLoading] = useState<boolean>(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [composeResult, setComposeResult] = useState<AiComposeResult | null>(null);

  useEffect(() => {
    setComposeTopic((prev) => {
      const isAnyDefault = Object.values(UI_TRANSLATIONS).some(
        (entry) => entry.ai.defaultComposeTopic === prev
      );
      return isAnyDefault ? t.defaultComposeTopic : prev;
    });
  }, [t.defaultComposeTopic]);

  useEffect(() => {
    if (externalInput && externalInput.trim()) {
      setAnalyzeInput(externalInput);
      setSubTab('analyze');
    }
  }, [externalInput]);

  useEffect(() => {
    if (openChallengeSignal > 0) {
      setSubTab('challenge');
    }
  }, [openChallengeSignal]);

  const sampleTransmissions = [
    {
      label: t.sample1,
      payload: '-... . --.. -... . -.. -. --- ... - / .--- . / .--. .-. --- --. .-. .- --',
      hint: 'Decoded Morse or direct Serbian Morse',
    },
    {
      label: t.sample2,
      payload: 'HSMA ZLRAVY QL ZPNBYHU',
      hint: 'Serbian tactical phrase shifted by Caesar',
    },
    {
      label: t.sample3,
      payload: 'S1JJUF RPX1NJR05BTF9BS1RJVkFO'.replace(' ', ''),
      hint: 'Base64 ASCII packet',
    },
  ];

  const runAnalyze = async () => {
    if (!analyzeInput.trim()) return;
    setAnalyzeLoading(true);
    setAnalyzeError(null);
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: analyzeInput, hint: analyzeHint, language: lang }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI analysis failed');
      setAnalyzeResult(data as AiAnalysisResult);
    } catch (err: unknown) {
      setAnalyzeError(err instanceof Error ? err.message : t.commError);
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const runChallenge = async (overrideLevel?: number) => {
    const targetLevel = clampChallengeLevel(overrideLevel ?? challengeLevel);
    if (overrideLevel !== undefined) {
      setChallengeLevel(targetLevel);
    }
    setChallengeLoading(true);
    setChallengeError(null);
    setShowHint(false);
    setUserAnswer('');
    setAnswerFeedback(null);
    try {
      const res = await fetch('/api/ai/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: targetLevel, language: lang }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate challenge');
      const parsed = data as AiChallengeResult;
      const validAlgs: CipherAlgorithm[] = [
        'caesar',
        'vigenere',
        'atbash',
        'railfence',
        'xor_hex',
        'base64',
        'binary',
      ];
      const steps: CipherStep[] =
        Array.isArray(parsed.cipherSteps) && parsed.cipherSteps.length > 0
          ? parsed.cipherSteps.filter((s) => validAlgs.includes(s.algorithm))
          : [
              {
                algorithm: validAlgs.includes(parsed.cipherType as CipherAlgorithm)
                  ? (parsed.cipherType as CipherAlgorithm)
                  : 'caesar',
                key: parsed.cipherKey || '5',
              },
            ];

      const ciphered = applyCipherChain(parsed.plaintext, steps, 'encrypt');
      const morse = textToMorse(ciphered);

      setChallenge({
        ...parsed,
        level: parsed.level ?? targetLevel,
        cipherSteps: steps,
        cipherType: parsed.cipherType || steps.map((s) => s.algorithm).join(' → '),
        cipherKey: parsed.cipherKey || steps.map((s) => s.key || 'MIRROR').join(' | '),
      });
      setChallengeCiphertext(ciphered);
      setChallengeMorse(morse);
    } catch (err: unknown) {
      setChallengeError(err instanceof Error ? err.message : t.commError);
    } finally {
      setChallengeLoading(false);
    }
  };

  const checkChallengeAnswer = () => {
    if (!challenge) return;
    const normalizeSolution = (s: string) =>
      s
        .trim()
        .toUpperCase()
        .replace(/[-_\s]+/g, ' ');
    const normUser = normalizeSolution(userAnswer);
    const normTarget = normalizeSolution(challenge.plaintext);
    const isCorrect = normUser === normTarget;
    setAnswerFeedback(isCorrect ? 'correct' : 'wrong');

    if (isCorrect) {
      const solvedLvl = clampChallengeLevel(challenge.level ?? challengeLevel);
      const next = clearedLevels.includes(solvedLvl)
        ? clearedLevels
        : [...clearedLevels, solvedLvl].sort((a, b) => a - b);
      try {
        localStorage.setItem('morse_crypto_cleared_levels', JSON.stringify(next));
      } catch {
        // Ignore storage quota issues
      }
      if (onClearedLevelsChange) {
        onClearedLevelsChange(next);
      } else {
        setInternalCleared(next);
      }
    }
  };

  const runCompose = async () => {
    if (!composeTopic.trim()) return;
    setComposeLoading(true);
    setComposeError(null);
    try {
      const res = await fetch('/api/ai/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: composeTopic, cipherPreference: composeCipher, language: lang }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Compose failed');
      setComposeResult(data as AiComposeResult);
    } catch (err: unknown) {
      setComposeError(err instanceof Error ? err.message : t.commError);
    } finally {
      setComposeLoading(false);
    }
  };

  const composedCiphertext = composeResult
    ? applyCipher(composeResult.tacticalMessage, composeCipher, 'encrypt', composeResult.recommendedKey)
    : '';
  const composedMorse = composedCiphertext ? textToMorse(composedCiphertext) : '';

  const levelProfile = getLevelProfile(challengeLevel);
  const activeChallengeProfile = getLevelProfile(challenge?.level ?? challengeLevel);
  const bestClearedLevel = clearedLevels.length > 0 ? Math.max(...clearedLevels) : 0;
  const quickPresetLevels = [1, 16, 36, 56, 76, 99];

  return (
    <div className="space-y-8">
      {/* Header & Sub-Navigation */}
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
            onClick={() => setSubTab('analyze')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'analyze' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-300 hover:text-white'
            }`}
          >
            {t.tabAnalyze}
          </button>
          <button
            type="button"
            onClick={() => setSubTab('challenge')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'challenge' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-300 hover:text-white'
            }`}
          >
            {t.tabChallenge}
          </button>
          <button
            type="button"
            onClick={() => setSubTab('compose')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'compose' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-300 hover:text-white'
            }`}
          >
            {t.tabCompose}
          </button>
        </div>
      </div>

      {/* TAB 1: AI CRYPTO & MORSE ANALYZER */}
      {subTab === 'analyze' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-6 bg-[#111827] border border-white/10 rounded-xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-medium text-slate-300">{t.interceptedLabel}</label>
              <div className="flex flex-wrap items-center gap-2">
                {sampleTransmissions.map((s) => (
                  <button
                    key={s.payload}
                    type="button"
                    onClick={() => {
                      setAnalyzeInput(s.payload);
                      setAnalyzeHint(s.hint);
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-md bg-[#0A0E17] border border-white/10 text-slate-300 hover:border-cyan-500/50 hover:text-white transition-colors cursor-pointer"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              value={analyzeInput}
              onChange={(e) => setAnalyzeInput(e.target.value)}
              rows={5}
              placeholder="... --- ... / -.- .-. .. .--. - ---"
              className="w-full rounded-lg bg-[#0A0E17] border border-white/10 p-3.5 text-sm font-mono text-amber-300 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 resize-none"
            />

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">{t.hintLabel}</label>
              <input
                type="text"
                value={analyzeHint}
                onChange={(e) => setAnalyzeHint(e.target.value)}
                placeholder={t.hintPlaceholder}
                className="w-full rounded-lg bg-[#0A0E17] border border-white/10 px-3.5 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <button
              type="button"
              onClick={runAnalyze}
              disabled={analyzeLoading || !analyzeInput.trim()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Cpu className="w-4 h-4" />
              <span>{analyzeLoading ? t.analyzing : t.runAnalyze}</span>
            </button>

            {analyzeError && (
              <div className="flex items-start gap-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 p-3.5 text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{analyzeError}</span>
              </div>
            )}
          </div>

          {/* Result Column */}
          <div className="lg:col-span-6 bg-[#111827] border border-white/10 rounded-xl p-6 flex flex-col justify-between">
            {!analyzeResult ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-12 px-4">
                <ShieldCheck className="w-10 h-10 text-slate-600 mb-3" />
                <h3 className="font-display text-base font-medium text-slate-300">{t.emptyTitle}</h3>
                <p className="text-xs text-slate-500 mt-1.5 max-w-sm">{t.emptyDesc}</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/10">
                  <div>
                    <div className="text-xs text-slate-400">{t.detectedFormat}</div>
                    <div className="font-display text-base font-semibold text-white mt-0.5">
                      {analyzeResult.detectedFormat}
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="text-xs text-slate-400">{t.confidence}</div>
                    <div className="font-mono text-lg font-bold text-cyan-400">
                      {analyzeResult.confidencePercent}%
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs text-slate-400">{t.decodedPlain}</div>
                  <div className="rounded-lg bg-[#0A0E17] border border-cyan-500/30 p-3.5 font-mono text-base font-semibold text-cyan-300 break-words">
                    {analyzeResult.decodedPlaintext}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{t.morseEquiv}</span>
                    <button
                      type="button"
                      onClick={() =>
                        void audioEngine.playMorseSequence(analyzeResult.morseRepresentation, { wpm: 16 })
                      }
                      className="inline-flex items-center gap-1.5 text-xs text-amber-300 hover:text-amber-200 cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>{t.play}</span>
                    </button>
                  </div>
                  <div className="rounded-lg bg-[#0A0E17] border border-white/10 p-3 font-mono text-xs text-amber-300 break-words">
                    {analyzeResult.morseRepresentation}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-slate-400">{t.steps}</div>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {analyzeResult.analysisSteps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="font-mono text-cyan-400 tabular-nums">{i + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-400">{analyzeResult.securityNote}</span>
                  <button
                    type="button"
                    onClick={() => onUseMorseInStudio(analyzeResult.decodedPlaintext)}
                    className="text-xs font-medium text-cyan-400 hover:text-cyan-300 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {t.openInStudio}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: AI CRYPTO + MORSE MISSIONS (LEVELS 1-99 CAPABILITY ASSESSMENT) */}
      {subTab === 'challenge' && (
        <div className="bg-[#111827] border border-white/10 rounded-xl p-6 space-y-6">
          {/* 99-Level Capability Selector & Progress Strip */}
          <div className="space-y-4 pb-5 border-b border-white/10">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                    {t.capabilityTitle}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-[#0A0E17] border border-white/10 font-mono text-[11px] text-amber-300 tabular-nums">
                    {t.tiers[levelProfile.tierKey]} · Tier {levelProfile.tier}/6
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 tabular-nums">
                  <span>
                    {t.layersLabel}:{' '}
                    <strong className="text-slate-200 font-mono">{levelProfile.layerCount}×</strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Morse:{' '}
                    <strong className="text-slate-200 font-mono">{levelProfile.wpm} WPM</strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <Award className="w-3.5 h-3.5" />
                    {t.clearedLabel}: {clearedLevels.length}/99
                    {bestClearedLevel > 0 ? ` (${t.bestLevelLabel} ${bestClearedLevel})` : ''}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center rounded-lg bg-[#0A0E17] border border-white/10 p-0.5">
                  <button
                    type="button"
                    onClick={() => setChallengeLevel((l) => clampChallengeLevel(l - 1))}
                    disabled={challengeLevel <= 1}
                    aria-label="Decrease level"
                    className="p-1.5 text-slate-300 hover:text-white disabled:opacity-35 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-1 px-2">
                    <span className="text-[11px] text-slate-400">{t.levelLabel}</span>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={challengeLevel}
                      onChange={(e) => setChallengeLevel(clampChallengeLevel(Number(e.target.value)))}
                      aria-label={t.levelLabel}
                      className="w-12 bg-transparent text-center font-mono text-sm font-bold text-cyan-300 focus:outline-none tabular-nums"
                    />
                    <span className="font-mono text-xs text-slate-500">/99</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setChallengeLevel((l) => clampChallengeLevel(l + 1))}
                    disabled={challengeLevel >= 99}
                    aria-label="Increase level"
                    className="p-1.5 text-slate-300 hover:text-white disabled:opacity-35 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => void runChallenge()}
                  disabled={challengeLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`w-4 h-4 ${challengeLoading ? 'animate-spin' : ''}`} />
                  <span>
                    {challengeLoading
                      ? t.generatingMission
                      : `${t.newMission} (${t.levelLabel} ${challengeLevel})`}
                  </span>
                </button>
              </div>
            </div>

            {/* Smooth 1..99 Slider + Tier Jump Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <input
                type="range"
                min={1}
                max={99}
                step={1}
                value={challengeLevel}
                onChange={(e) => setChallengeLevel(clampChallengeLevel(Number(e.target.value)))}
                aria-label={t.capabilityTitle}
                className="flex-1 h-1.5 accent-cyan-400 cursor-pointer"
              />
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                {quickPresetLevels.map((preset) => {
                  const pProfile = getLevelProfile(preset);
                  const active = challengeLevel === preset;
                  const done = clearedLevels.includes(preset);
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setChallengeLevel(preset)}
                      className={`px-2 py-1 rounded-md text-[11px] font-mono border transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                        active
                          ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-semibold'
                          : done
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:border-emerald-400/60'
                          : 'bg-[#0A0E17] text-slate-300 border-white/10 hover:border-white/25'
                      }`}
                    >
                      Lv {preset} · {pProfile.layerCount}×
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Overall 99-Level Assessment Completion Bar */}
            <div className="h-1.5 w-full bg-[#0A0E17] rounded overflow-hidden border border-white/5">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-amber-400 transition-all duration-300"
                style={{ width: `${Math.round((clearedLevels.length / 99) * 100)}%` }}
              />
            </div>
          </div>

          {challengeError && (
            <div className="flex items-start gap-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 p-3.5 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{challengeError}</span>
            </div>
          )}

          {!challenge ? (
            <div className="py-12 text-center space-y-2">
              <p className="text-sm text-slate-300">{t.missionEmpty}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-4">
                <div>
                  <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-[#0A0E17] border border-cyan-500/30 font-mono text-cyan-300 tabular-nums">
                      {t.levelLabel} {activeChallengeProfile.level}/99
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-[#0A0E17] border border-white/10 font-mono text-amber-300">
                      {t.tiers[activeChallengeProfile.tierKey]}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      {answerFeedback === 'correct' || activeChallengeProfile.algoVisibility === 'full' ? (
                        challenge.cipherType.toUpperCase()
                      ) : activeChallengeProfile.algoVisibility === 'partial' ? (
                        <>
                          <Lock className="w-3 h-3 text-amber-400" />
                          {activeChallengeProfile.layerCount} {t.partialLayersLabel}
                        </>
                      ) : (
                        <>
                          <Lock className="w-3 h-3 text-rose-400" />
                          {t.classifiedLabel} ({activeChallengeProfile.layerCount}×)
                        </>
                      )}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {t.keyWord}:{' '}
                      {answerFeedback === 'correct' || activeChallengeProfile.keyVisibility === 'full'
                        ? challenge.cipherKey || 'Atbash'
                        : activeChallengeProfile.keyVisibility === 'masked'
                        ? (challenge.cipherSteps || [])
                            .map((s) => (s.algorithm === 'atbash' ? 'MIRROR' : maskCipherKey(s.key)))
                            .join(' | ')
                        : t.hiddenKeyLabel}
                    </span>
                  </div>
                  <h3 className="font-display text-xl font-semibold text-white mt-2">{challenge.title}</h3>
                  <p className="text-sm text-slate-300 mt-1.5">{challenge.briefing}</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                      {t.interceptedMorse} ({activeChallengeProfile.wpm} WPM)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void audioEngine.playMorseSequence(challengeMorse, {
                          wpm: activeChallengeProfile.wpm,
                        })
                      }
                      className="inline-flex items-center gap-1.5 text-xs text-amber-300 hover:text-amber-200 cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>{t.listenSignal}</span>
                    </button>
                  </div>
                  <div className="rounded-lg bg-[#0A0E17] border border-white/10 p-3.5 font-mono text-xs text-amber-300 tracking-wider break-words">
                    {challengeMorse}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs text-slate-400">{t.cipherLayer}</span>
                  <div className="rounded-lg bg-[#0A0E17] border border-white/10 p-3 font-mono text-sm text-cyan-300 break-words">
                    {challengeCiphertext}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 bg-[#0A0E17] border border-white/10 rounded-xl p-5 flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <label className="text-xs font-medium text-slate-300 block">{t.yourSolution}</label>
                  <input
                    type="text"
                    value={userAnswer}
                    onChange={(e) => {
                      setUserAnswer(e.target.value);
                      setAnswerFeedback(null);
                    }}
                    placeholder={t.solutionPlaceholder}
                    className="w-full rounded-lg bg-[#111827] border border-white/15 px-3.5 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-cyan-500"
                  />

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={checkChallengeAnswer}
                      className="flex-1 py-2 px-4 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-colors cursor-pointer"
                    >
                      {t.verifySolution}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowHint((v) => !v)}
                      className="inline-flex items-center gap-1.5 py-2 px-3 rounded-lg text-xs text-slate-300 bg-[#111827] border border-white/10 hover:border-white/25 cursor-pointer"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>{t.hintBtn}</span>
                    </button>
                  </div>

                  {showHint && (
                    <div className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded-lg p-3 space-y-1.5">
                      <p>{challenge.hint}</p>
                      {activeChallengeProfile.algoVisibility !== 'full' && challenge.cipherSteps && (
                        <p className="font-mono text-[11px] text-amber-200/80 pt-1 border-t border-amber-500/20">
                          {t.solutionChainLabel}:{' '}
                          {challenge.cipherSteps.map((s) => s.algorithm.toUpperCase()).join(' → ')}
                        </p>
                      )}
                    </div>
                  )}

                  {answerFeedback === 'correct' && (
                    <div className="space-y-2.5 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>{t.correctFeedback}</span>
                      </div>
                      {challenge.cipherSteps && (
                        <div className="font-mono text-[11px] text-emerald-200/90 bg-[#0A0E17]/70 rounded p-2 border border-emerald-500/20">
                          {t.solutionChainLabel}:{' '}
                          {challenge.cipherSteps
                            .map((s) =>
                              s.algorithm === 'atbash'
                                ? 'ATBASH'
                                : `${s.algorithm.toUpperCase()}(${s.key})`
                            )
                            .join(' → ')}
                        </div>
                      )}
                      {activeChallengeProfile.level < 99 ? (
                        <button
                          type="button"
                          onClick={() => void runChallenge(activeChallengeProfile.level + 1)}
                          className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-md bg-emerald-400 text-slate-950 font-semibold hover:bg-emerald-300 transition-colors cursor-pointer"
                        >
                          <span>
                            {t.nextLevelBtn} ({t.levelLabel} {activeChallengeProfile.level + 1})
                          </span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <div className="font-semibold text-amber-300 text-center py-1">
                          {t.masteredAll}
                        </div>
                      )}
                    </div>
                  )}

                  {answerFeedback === 'wrong' && (
                    <div className="flex items-center gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{t.wrongFeedback}</span>
                    </div>
                  )}
                </div>

                <div className="text-[11px] text-slate-500 pt-3 border-t border-white/10">{t.missionTip}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: AI SMART COMPOSER */}
      {subTab === 'compose' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-[#111827] border border-white/10 rounded-xl p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">{t.composeTopicLabel}</label>
              <textarea
                value={composeTopic}
                onChange={(e) => setComposeTopic(e.target.value)}
                rows={4}
                className="w-full rounded-lg bg-[#0A0E17] border border-white/10 p-3 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">{t.cipherAlgoLabel}</label>
              <select
                value={composeCipher}
                onChange={(e) => setComposeCipher(e.target.value as CipherAlgorithm)}
                className="w-full rounded-lg bg-[#0A0E17] border border-white/10 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                <option value="vigenere">Vigenère</option>
                <option value="caesar">Caesar Shift</option>
                <option value="railfence">Rail Fence</option>
                <option value="atbash">Atbash</option>
              </select>
            </div>

            <button
              type="button"
              onClick={runCompose}
              disabled={composeLoading}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{composeLoading ? t.composing : t.generateMsg}</span>
            </button>

            {composeError && (
              <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
                {composeError}
              </div>
            )}
          </div>

          <div className="lg:col-span-7 bg-[#111827] border border-white/10 rounded-xl p-6 space-y-4">
            {!composeResult ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500 py-12">
                {t.composeEmpty}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div>
                    <div className="text-xs text-slate-400">{t.tacticalMsg}</div>
                    <div className="font-mono text-base font-semibold text-white mt-0.5">
                      {composeResult.tacticalMessage}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-400">{t.keyWord}</div>
                    <div className="font-mono text-sm font-semibold text-cyan-400">
                      {composeResult.recommendedKey}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs text-slate-400">{t.ciphertext}</div>
                  <div className="rounded-lg bg-[#0A0E17] border border-white/10 p-3 font-mono text-sm text-cyan-300">
                    {composedCiphertext}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{t.morseTx}</span>
                    <button
                      type="button"
                      onClick={() => void audioEngine.playMorseSequence(composedMorse, { wpm: 16 })}
                      className="inline-flex items-center gap-1.5 text-xs text-amber-300 hover:text-amber-200 cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>{t.transmit}</span>
                    </button>
                  </div>
                  <div className="rounded-lg bg-[#0A0E17] border border-white/10 p-3 font-mono text-xs text-amber-300 break-words">
                    {composedMorse}
                  </div>
                </div>

                <p className="text-xs text-slate-400 pt-2 border-t border-white/10">
                  {composeResult.protocolNote}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

