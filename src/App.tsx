import { useCallback, useEffect, useRef, useState } from 'react';
import { Award, Check, ChevronDown, Globe, Mic, MicOff } from 'lucide-react';
import { MorseStudio } from './components/MorseStudio';
import { CryptoLab } from './components/CryptoLab';
import { AiCryptanalyst } from './components/AiCryptanalyst';
import { BlockchainLedger } from './components/BlockchainLedger';
import { LaserTagArena } from './components/LaserTagArena';
import {
  calculateEarnedXp,
  clampChallengeLevel,
  getLevelProfile,
  getTotalMaxChallengeXp,
  textToMorse,
} from './utils/morseAndCrypto';
import { useVoiceCommands, VoiceAction } from './hooks/useVoiceCommands';
import { AppLanguage, LANGUAGE_OPTIONS, UI_TRANSLATIONS } from './i18n/translations';

type ActiveSection = 'morse' | 'crypto' | 'ai' | 'blockchain' | 'arena';

const MAX_CAPABILITY_XP = getTotalMaxChallengeXp();

export default function App() {
  const [section, setSection] = useState<ActiveSection>('morse');
  const [lang, setLang] = useState<AppLanguage>('sr');
  const [langMenuOpen, setLangMenuOpen] = useState<boolean>(false);
  const [clearedLevels, setClearedLevels] = useState<number[]>(() => {
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
  const [challengeLevel, setChallengeLevel] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('morse_crypto_current_level'));
      if (Number.isFinite(saved) && saved >= 1 && saved <= 99) return Math.round(saved);
    } catch {
      // Ignore storage errors
    }
    return 1;
  });
  const [openChallengeSignal, setOpenChallengeSignal] = useState<number>(0);
  const [morseMessage, setMorseMessage] = useState<string>('SOS SEKTOR ALFA');
  const [aiExternalInput, setAiExternalInput] = useState<string>('');
  const [pendingArenaBeacon, setPendingArenaBeacon] = useState<{
    plaintext: string;
    morse: string;
    autoSendId?: number;
  } | null>({
    plaintext: 'SOS SEKTOR ALFA',
    morse: textToMorse('SOS SEKTOR ALFA'),
  });

  const [cryptoSeed, setCryptoSeed] = useState<{
    id: number;
    text: string;
    mode?: 'encrypt' | 'decrypt';
  } | null>(null);
  const [cryptoVoiceSignal, setCryptoVoiceSignal] = useState<{
    id: number;
    action: 'encrypt' | 'decrypt' | 'beacon';
  } | null>(null);
  const [arenaBeaconSignal, setArenaBeaconSignal] = useState<number>(0);
  const [arenaEncryptSignal, setArenaEncryptSignal] = useState<number>(0);
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);

  const sectionRef = useRef(section);
  sectionRef.current = section;
  const morseMessageRef = useRef(morseMessage);
  morseMessageRef.current = morseMessage;
  const langRef = useRef(lang);
  langRef.current = lang;
  const langMenuRef = useRef<HTMLDivElement | null>(null);

  const t = UI_TRANSLATIONS[lang];
  const activeLanguage = LANGUAGE_OPTIONS.find((item) => item.code === lang) ?? LANGUAGE_OPTIONS[0];

  useEffect(() => {
    if (!langMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLangMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [langMenuOpen]);

  const handleSendToArenaBeacon = useCallback(
    (plaintext: string, morse: string, autoSend = false) => {
      setPendingArenaBeacon({
        plaintext,
        morse,
        autoSendId: autoSend ? Date.now() : undefined,
      });
      setSection('arena');
    },
    []
  );

  const handleSendCipherToAi = (payload: string) => {
    setAiExternalInput(payload);
    setSection('ai');
  };

  const handleUseMorseInStudio = (plaintext: string) => {
    setMorseMessage(plaintext);
    setSection('morse');
  };

  const handleVoiceCommand = useCallback(
    (action: VoiceAction, transcript: string) => {
      const currentSection = sectionRef.current;
      const currentMorse = morseMessageRef.current;
      const currentT = UI_TRANSLATIONS[langRef.current].toolbar;
      const nowId = Date.now();

      if (action === 'encrypt') {
        if (currentSection === 'arena') {
          setArenaEncryptSignal((n) => n + 1);
        } else {
          if (currentSection === 'morse') {
            setCryptoSeed({ id: nowId, text: currentMorse, mode: 'encrypt' });
          }
          setSection('crypto');
          setCryptoVoiceSignal({ id: nowId, action: 'encrypt' });
        }
        setVoiceFeedback(`${currentT.cmdEncryptPrefix} (${transcript})`);
      } else if (action === 'decrypt') {
        if (currentSection === 'morse') {
          setCryptoSeed({ id: nowId, text: currentMorse, mode: 'decrypt' });
        }
        setSection('crypto');
        setCryptoVoiceSignal({ id: nowId, action: 'decrypt' });
        setVoiceFeedback(`${currentT.cmdDecryptPrefix} (${transcript})`);
      } else if (action === 'beacon') {
        if (currentSection === 'arena') {
          setArenaBeaconSignal((n) => n + 1);
        } else if (currentSection === 'crypto') {
          setCryptoVoiceSignal({ id: nowId, action: 'beacon' });
        } else {
          handleSendToArenaBeacon(currentMorse, textToMorse(currentMorse), true);
        }
        setVoiceFeedback(`${currentT.cmdBeaconPrefix} (${transcript})`);
      }
    },
    [handleSendToArenaBeacon]
  );

  useEffect(() => {
    if (!voiceFeedback) return;
    const timer = window.setTimeout(() => setVoiceFeedback(null), 4000);
    return () => window.clearTimeout(timer);
  }, [voiceFeedback]);

  const voice = useVoiceCommands({
    lang,
    onCommand: handleVoiceCommand,
  });

  const handleChallengeLevelChange = useCallback((nextLevel: number) => {
    const clamped = clampChallengeLevel(nextLevel);
    setChallengeLevel(clamped);
    try {
      localStorage.setItem('morse_crypto_current_level', String(clamped));
    } catch {
      // Ignore storage errors
    }
  }, []);

  const navItems: { id: ActiveSection; label: string }[] = [
    { id: 'morse', label: t.nav.morse },
    { id: 'crypto', label: t.nav.crypto },
    { id: 'ai', label: t.nav.ai },
    { id: 'blockchain', label: t.nav.blockchain },
    { id: 'arena', label: t.nav.arena },
  ];

  const contextLabel =
    section === 'morse'
      ? t.toolbar.ctxMorse
      : section === 'crypto'
      ? t.toolbar.ctxCrypto
      : section === 'ai'
      ? t.toolbar.ctxAi
      : section === 'blockchain'
      ? t.toolbar.ctxBlockchain
      : t.toolbar.ctxArena;

  const earnedXp = calculateEarnedXp(clearedLevels);
  const highestCleared = clearedLevels.length > 0 ? Math.max(...clearedLevels) : 0;
  const rankProfile = getLevelProfile(Math.max(1, highestCleared || challengeLevel));
  const currentLevelProfile = getLevelProfile(challengeLevel);
  const xpProgressPct = MAX_CAPABILITY_XP > 0 ? Math.min(100, Math.round((earnedXp / MAX_CAPABILITY_XP) * 100)) : 0;

  return (
    <div className="min-h-screen bg-[#0A0E17] text-slate-100 flex flex-col">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="border-b border-white/10 bg-[#0A0E17]/95 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setSection('morse');
            }}
            className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            MorzeKripto
          </a>

          {/* Zone 2: 4 Concise Single-Line Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {navItems.map((item) => {
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'text-white border-cyan-400'
                      : 'text-slate-400 border-transparent hover:text-slate-100 hover:border-white/25'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary Action Button */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setSection(section === 'arena' ? 'morse' : 'arena')}
              className="px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-500 rounded-lg hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {section === 'arena' ? t.nav.openLab : t.nav.openArena}
            </button>
          </div>
        </div>

        {/* Capability Level, XP & Rank Progress Bar */}
        <div className="border-t border-white/5 bg-[#080C14]/90">
          <button
            type="button"
            id="header-capability-bar"
            onClick={() => {
              setSection('ai');
              setOpenChallengeSignal((n) => n + 1);
            }}
            aria-label={t.headerProgress.barAria}
            className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-1.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5 text-[11px] shrink-0">
              <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-cyan-300 tabular-nums">
                <Award className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>
                  {t.headerProgress.levelLabel} {challengeLevel}/99
                </span>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-[#111827] border border-white/10 font-mono text-[10px] text-amber-300 whitespace-nowrap">
                {t.headerProgress.rankLabel}: {t.ai.tiers[rankProfile.tierKey]}
              </span>
              <span className="hidden sm:inline font-mono text-[10px] text-slate-400 tabular-nums whitespace-nowrap">
                {t.headerProgress.clearedLabel}: {clearedLevels.length}/99 · {currentLevelProfile.layerCount}×
              </span>
            </div>

            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={xpProgressPct}
              aria-label={t.headerProgress.barAria}
              className="flex-1 min-w-[120px] h-1.5 bg-[#111827] rounded overflow-hidden border border-white/10"
            >
              <div
                className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-amber-400 transition-all duration-300"
                style={{ width: `${xpProgressPct}%` }}
              />
            </div>

            <div className="font-mono text-[11px] text-slate-300 tabular-nums shrink-0 whitespace-nowrap">
              <span className="text-cyan-300 font-semibold">{earnedXp.toLocaleString()}</span>
              <span className="text-slate-500"> / {MAX_CAPABILITY_XP.toLocaleString()}</span>{' '}
              <span className="text-slate-400">{t.headerProgress.xpLabel}</span>
              <span className="text-slate-500 ml-1.5">({xpProgressPct}%)</span>
            </div>
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Compact Workspace Toolbar (Mobile Nav + Voice Commands + Language Menu) */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex md:hidden items-center gap-1 p-1 bg-[#111827] border border-white/10 rounded-lg overflow-x-auto max-w-full">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                  section === item.id ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
            <span>{t.toolbar.tagline}</span>
            <span aria-hidden="true">·</span>
            <span className="text-slate-300">{contextLabel}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 ml-auto">
            {/* Web Speech API Voice Control & Live Status */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={voice.toggleListening}
                disabled={!voice.supported}
                aria-pressed={voice.listening}
                className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  !voice.supported
                    ? 'bg-[#111827] border-white/10 text-slate-500 cursor-not-allowed'
                    : voice.listening
                    ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-semibold cursor-pointer'
                    : 'bg-[#111827] border-white/10 text-slate-200 hover:border-cyan-500/50 cursor-pointer'
                }`}
              >
                {voice.listening ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                <span>
                  {!voice.supported
                    ? t.toolbar.voiceUnsupported
                    : voice.listening
                    ? t.toolbar.voiceActive
                    : t.toolbar.voiceCommands}
                </span>
              </button>

              {voice.error ? (
                <span className="text-xs text-rose-400">{voice.error}</span>
              ) : voiceFeedback ? (
                <span className="text-xs text-cyan-300 font-medium">{voiceFeedback}</span>
              ) : voice.listening ? (
                <span className="text-xs text-slate-300 hidden sm:inline">
                  {voice.lastTranscript ? (
                    <span className="font-mono text-cyan-300">“{voice.lastTranscript}”</span>
                  ) : (
                    t.toolbar.sayPrompt
                  )}
                </span>
              ) : (
                <span className="text-xs text-slate-500 hidden lg:inline">
                  {t.toolbar.commandsHint}
                </span>
              )}
            </div>

            {/* 7-Language Selector Dropdown Menu */}
            <div ref={langMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setLangMenuOpen((open) => !open)}
                aria-haspopup="listbox"
                aria-expanded={langMenuOpen}
                aria-label={`${t.toolbar.languageMenuLabel}: ${activeLanguage.nativeName}`}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-[#111827] border border-white/10 rounded-lg text-slate-200 hover:border-cyan-500/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="font-mono text-[11px] text-cyan-300">{activeLanguage.shortLabel}</span>
                <span>{activeLanguage.nativeName}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                    langMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {langMenuOpen && (
                <div
                  role="listbox"
                  aria-label={t.toolbar.languageMenuLabel}
                  className="absolute right-0 mt-1.5 w-48 py-1 bg-[#111827] border border-white/15 rounded-xl shadow-2xl z-40"
                >
                  {LANGUAGE_OPTIONS.map((option) => {
                    const selected = option.code === lang;
                    return (
                      <button
                        key={option.code}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          setLang(option.code);
                          setLangMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left transition-colors whitespace-nowrap cursor-pointer ${
                          selected
                            ? 'bg-[#182235] text-white font-semibold'
                            : 'text-slate-300 hover:bg-[#182235]/60 hover:text-white'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2.5">
                          <span className="font-mono text-[11px] text-cyan-400 w-5">
                            {option.shortLabel}
                          </span>
                          <span>{option.nativeName}</span>
                        </span>
                        {selected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Active Section */}
        {section === 'morse' && (
          <MorseStudio
            lang={lang}
            morseMessage={morseMessage}
            onMorseMessageChange={setMorseMessage}
            onSendToArenaBeacon={(p, m) => handleSendToArenaBeacon(p, m, false)}
          />
        )}

        {section === 'crypto' && (
          <CryptoLab
            lang={lang}
            onSendCipherToAi={handleSendCipherToAi}
            onSendToArenaBeacon={handleSendToArenaBeacon}
            externalInputSeed={cryptoSeed}
            voiceCommandSignal={cryptoVoiceSignal}
          />
        )}

        {section === 'ai' && (
          <AiCryptanalyst
            lang={lang}
            externalInput={aiExternalInput}
            onUseMorseInStudio={handleUseMorseInStudio}
            challengeLevel={challengeLevel}
            onChallengeLevelChange={handleChallengeLevelChange}
            clearedLevels={clearedLevels}
            onClearedLevelsChange={setClearedLevels}
            openChallengeSignal={openChallengeSignal}
          />
        )}

        {section === 'blockchain' && (
          <BlockchainLedger
            lang={lang}
            currentMorseMessage={morseMessage}
            onSendToArenaBeacon={handleSendToArenaBeacon}
            onSendCipherToAi={handleSendCipherToAi}
          />
        )}

        {section === 'arena' && (
          <LaserTagArena
            lang={lang}
            pendingMorseBeacon={pendingArenaBeacon}
            voiceBeaconSignal={arenaBeaconSignal}
            voiceEncryptSignal={arenaEncryptSignal}
            voiceListening={voice.listening}
            voiceSupported={voice.supported}
            onToggleVoice={voice.toggleListening}
          />
        )}
      </main>
    </div>
  );
}
