import { buildMorsePulseTimeline } from './morseAndCrypto';

export type MorseWaveform = 'sine' | 'triangle' | 'square' | 'sawtooth';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private activeOsc: OscillatorNode | null = null;
  private activeGain: GainNode | null = null;
  private playbackCancelled = false;
  private currentFrequency = 680;
  private isToneActive = false;
  private waveform: MorseWaveform = 'sine';

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (!this.analyser) {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.72;
      this.analyser.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  public setWaveform(type: MorseWaveform) {
    this.waveform = type;
    if (this.activeOsc) {
      this.activeOsc.type = type;
    }
  }

  public getWaveform(): MorseWaveform {
    return this.waveform;
  }

  public getTelemetry() {
    return {
      isToneActive: this.isToneActive,
      frequency: this.currentFrequency,
      sampleRate: this.ctx?.sampleRate ?? 48000,
      fftSize: this.analyser?.fftSize ?? 2048,
      frequencyBinCount: this.analyser?.frequencyBinCount ?? 1024,
    };
  }

  public readAnalyser(
    timeDomain: Uint8Array<ArrayBuffer>,
    frequencyData: Uint8Array<ArrayBuffer>
  ): boolean {
    if (!this.analyser) return false;
    this.analyser.getByteTimeDomainData(timeDomain);
    this.analyser.getByteFrequencyData(frequencyData);
    return true;
  }

  public startTone(frequency = 680, volume = 0.16, waveform?: MorseWaveform) {
    const ctx = this.ensureContext();
    if (!ctx || !this.analyser) return;
    this.stopTone();

    const wave = waveform ?? this.waveform;
    this.waveform = wave;
    this.currentFrequency = frequency;
    this.isToneActive = true;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 0.008);

    osc.connect(gain);
    gain.connect(this.analyser);
    osc.start();

    this.activeOsc = osc;
    this.activeGain = gain;
  }

  public stopTone() {
    this.isToneActive = false;
    if (this.activeGain && this.ctx) {
      const now = this.ctx.currentTime;
      try {
        this.activeGain.gain.cancelScheduledValues(now);
        this.activeGain.gain.setValueAtTime(Math.max(0.0001, this.activeGain.gain.value), now);
        this.activeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.012);
      } catch {
        // ignore
      }
    }
    if (this.activeOsc) {
      const osc = this.activeOsc;
      setTimeout(() => {
        try {
          osc.stop();
          osc.disconnect();
        } catch {
          // ignore
        }
      }, 20);
    }
    this.activeOsc = null;
    this.activeGain = null;
  }

  public stopSequence() {
    this.playbackCancelled = true;
    this.stopTone();
  }

  public async playMorseSequence(
    morse: string,
    options: {
      wpm?: number;
      frequency?: number;
      waveform?: MorseWaveform;
      onPulse?: (on: boolean, charIndex: number) => void;
    } = {}
  ): Promise<void> {
    const { wpm = 16, frequency = 680, waveform, onPulse } = options;
    this.playbackCancelled = false;
    const frames = buildMorsePulseTimeline(morse, wpm);

    for (const frame of frames) {
      if (this.playbackCancelled) break;
      onPulse?.(frame.on, frame.charIndex);
      if (frame.on) {
        this.startTone(frequency, 0.15, waveform);
      } else {
        this.stopTone();
      }
      await new Promise((resolve) => setTimeout(resolve, frame.durationMs));
    }

    this.stopTone();
    onPulse?.(false, -1);
  }

  public playLaserShot(isTeamAlpha = true) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    const startFreq = isTeamAlpha ? 980 : 760;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.14);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playHitConfirm() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1320, now);
    osc.frequency.setValueAtTime(1760, now + 0.045);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playDamageTaken() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.18);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }
}

export const audioEngine = new AudioEngine();
