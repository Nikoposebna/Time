import { useCallback, useEffect, useRef, useState } from 'react';
import { AppLanguage, LANGUAGE_OPTIONS } from '../i18n/translations';

export type VoiceAction = 'encrypt' | 'decrypt' | 'beacon';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

interface WindowWithSpeech extends Window {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

export function normalizeVoicePhrase(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .replace(/ž/g, 'z')
    .replace(/š/g, 's')
    .replace(/č/g, 'c')
    .replace(/ć/g, 'c')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function matchVoiceCommand(transcript: string): VoiceAction | null {
  const norm = normalizeVoicePhrase(transcript);
  if (!norm) return null;

  // Check decrypt before encrypt so "desifruj"/"descifrar"/"entschlusseln"/"расшифровать" match accurately
  if (
    /(desifruj|de sifruj|dekodiraj|decrypt|decode|descifrar|decodificar|entschlusseln|dekodieren|расшифр|декод|解密|復号)/.test(
      norm
    )
  ) {
    return 'decrypt';
  }

  if (
    /(sifruj|shifruj|kodiraj|encrypt|encode|cifrar|encriptar|verschlusseln|kodieren|зашифр|шифр|加密|暗号)/.test(
      norm
    )
  ) {
    return 'encrypt';
  }

  if (
    /(posalji beacon|posalji bikon|posalji signal|posalji poruku|emituj|send beacon|broadcast beacon|beacon|bikon|enviar baliza|baliza|signal senden|bake senden|отправить маяк|маяк|发送信标|信标|ビーコン)/.test(
      norm
    )
  ) {
    return 'beacon';
  }

  return null;
}

const VOICE_ERRORS: Record<
  AppLanguage,
  { unsupported: string; denied: string; noMic: string; network: string; startFail: string }
> = {
  sr: {
    unsupported: 'Web Speech API nije podržan u ovom pregledaču.',
    denied: 'Pristup mikrofonu je odbijen. Dozvolite mikrofon u pregledaču.',
    noMic: 'Mikrofon nije pronađen.',
    network: 'Greška mreže za prepoznavanje govora.',
    startFail: 'Nije moguće pokrenuti prepoznavanje govora.',
  },
  en: {
    unsupported: 'Web Speech API is not supported in this browser.',
    denied: 'Microphone permission denied. Allow microphone access in browser.',
    noMic: 'No microphone device detected.',
    network: 'Speech recognition network error.',
    startFail: 'Unable to start speech recognition.',
  },
  ru: {
    unsupported: 'Web Speech API не поддерживается в этом браузере.',
    denied: 'Доступ к микрофону запрещен. Разрешите микрофон в браузере.',
    noMic: 'Микрофон не найден.',
    network: 'Ошибка сети распознавания речи.',
    startFail: 'Не удалось запустить распознавание речи.',
  },
  zh: {
    unsupported: '当前浏览器不支持 Web Speech API。',
    denied: '麦克风权限被拒绝，请在浏览器中允许访问麦克风。',
    noMic: '未检测到麦克风设备。',
    network: '语音识别网络错误。',
    startFail: '无法启动语音识别。',
  },
  es: {
    unsupported: 'Web Speech API no es compatible con este navegador.',
    denied: 'Permiso de micrófono denegado. Permite el acceso en el navegador.',
    noMic: 'No se detectó micrófono.',
    network: 'Error de red en el reconocimiento de voz.',
    startFail: 'No se pudo iniciar el reconocimiento de voz.',
  },
  de: {
    unsupported: 'Die Web Speech API wird in diesem Browser nicht unterstützt.',
    denied: 'Mikrofonzugriff verweigert. Bitte im Browser erlauben.',
    noMic: 'Kein Mikrofon erkannt.',
    network: 'Netzwerkfehler bei der Spracherkennung.',
    startFail: 'Spracherkennung konnte nicht gestartet werden.',
  },
  ja: {
    unsupported: 'このブラウザは Web Speech API に対応していません。',
    denied: 'マイクの権限が拒否されました。ブラウザで許可してください。',
    noMic: 'マイクデバイスが見つかりません。',
    network: '音声認識のネットワークエラーです。',
    startFail: '音声認識を開始できませんでした。',
  },
};

interface UseVoiceCommandsOptions {
  lang: AppLanguage;
  onCommand: (action: VoiceAction, transcript: string) => void;
}

export function useVoiceCommands({ lang, onCommand }: UseVoiceCommandsOptions) {
  const getCtor = (): SpeechRecognitionCtor | null => {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as WindowWithSpeech;
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
  };

  const [supported] = useState<boolean>(() => Boolean(getCtor()));
  const [listening, setListening] = useState<boolean>(false);
  const [lastTranscript, setLastTranscript] = useState<string>('');
  const [lastCommand, setLastCommand] = useState<{
    action: VoiceAction;
    transcript: string;
    at: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const shouldListenRef = useRef<boolean>(false);
  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;

  const handledIndicesRef = useRef<Set<number>>(new Set());
  const lastActionAtRef = useRef<Record<VoiceAction, number>>({
    encrypt: 0,
    decrypt: 0,
    beacon: 0,
  });

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    setListening(false);
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore stop race
    }
  }, []);

  const startSession = useCallback(() => {
    const msgs = VOICE_ERRORS[lang];
    const Ctor = getCtor();
    if (!Ctor) {
      setError(msgs.unsupported);
      shouldListenRef.current = false;
      setListening(false);
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch {
        // ignore cleanup
      }
      recognitionRef.current = null;
    }

    handledIndicesRef.current.clear();
    const recognition = new Ctor();
    const locale = LANGUAGE_OPTIONS.find((l) => l.code === lang)?.speechLocale ?? 'sr-RS';
    recognition.lang = locale;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      setListening(true);
      setError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result || result.length === 0) continue;

        const primaryText = result[0]?.transcript?.trim() ?? '';
        if (primaryText) {
          setLastTranscript(primaryText);
        }

        if (handledIndicesRef.current.has(i)) continue;

        let matched: VoiceAction | null = null;
        let matchedText = primaryText;
        for (let alt = 0; alt < result.length; alt++) {
          const candidate = result[alt]?.transcript?.trim() ?? '';
          const action = matchVoiceCommand(candidate);
          if (action) {
            matched = action;
            matchedText = candidate;
            break;
          }
        }

        if (matched) {
          const now = Date.now();
          if (now - lastActionAtRef.current[matched] > 1200) {
            handledIndicesRef.current.add(i);
            lastActionAtRef.current[matched] = now;
            setLastCommand({ action: matched, transcript: matchedText, at: now });
            onCommandRef.current(matched, matchedText);
          }
        } else if (result.isFinal) {
          handledIndicesRef.current.add(i);
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        shouldListenRef.current = false;
        setListening(false);
        setError(msgs.denied);
      } else if (event.error === 'audio-capture') {
        shouldListenRef.current = false;
        setListening(false);
        setError(msgs.noMic);
      } else if (event.error === 'network') {
        setError(msgs.network);
      }
    };

    recognition.onend = () => {
      if (shouldListenRef.current) {
        window.setTimeout(() => {
          if (shouldListenRef.current) {
            try {
              handledIndicesRef.current.clear();
              recognition.start();
            } catch {
              startSession();
            }
          }
        }, 180);
      } else {
        setListening(false);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setError(msgs.startFail);
      shouldListenRef.current = false;
      setListening(false);
    }
  }, [lang]);

  const startListening = useCallback(() => {
    setError(null);
    shouldListenRef.current = true;
    startSession();
  }, [startSession]);

  const toggleListening = useCallback(() => {
    if (shouldListenRef.current || listening) {
      stopListening();
    } else {
      startListening();
    }
  }, [listening, startListening, stopListening]);

  useEffect(() => {
    if (shouldListenRef.current) {
      startSession();
    }
  }, [lang, startSession]);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return {
    supported,
    listening,
    lastTranscript,
    lastCommand,
    error,
    startListening,
    stopListening,
    toggleListening,
  };
}
