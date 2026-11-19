import React, { useEffect, useRef, useState } from 'react';
import { Activity } from 'lucide-react';
import { audioEngine, MorseWaveform } from '../utils/audioEngine';
import { AppLanguage, UI_TRANSLATIONS } from '../i18n/translations';

interface MorseOscillatorProps {
  lang: AppLanguage;
  frequency: number;
  waveform: MorseWaveform;
  isSignalActive: boolean;
  onWaveformChange: (waveform: MorseWaveform) => void;
}

const WAVEFORM_IDS: MorseWaveform[] = ['sine', 'triangle', 'square', 'sawtooth'];

function sampleIdealWave(phase: number, type: MorseWaveform): number {
  const norm = ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const t = norm / (Math.PI * 2); // 0..1
  switch (type) {
    case 'sine':
      return Math.sin(norm);
    case 'triangle':
      return t < 0.25 ? t * 4 : t < 0.75 ? 2 - t * 4 : t * 4 - 4;
    case 'square':
      return t < 0.5 ? 1 : -1;
    case 'sawtooth':
      return t * 2 - 1;
  }
}

export const MorseOscillator: React.FC<MorseOscillatorProps> = ({
  lang,
  frequency,
  waveform,
  isSignalActive,
  onWaveformChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [measuredPeakHz, setMeasuredPeakHz] = useState<number | null>(null);
  const propsRef = useRef({ frequency, waveform, isSignalActive });
  propsRef.current = { frequency, waveform, isSignalActive };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frameId = 0;
    let timeBuffer = new Uint8Array(new ArrayBuffer(2048));
    let freqBuffer = new Uint8Array(new ArrayBuffer(1024));
    let lastPeakUpdate = 0;

    const render = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 720;
      const cssH = canvas.clientHeight || 190;

      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // Background
      ctx.fillStyle = '#0A0E17';
      ctx.fillRect(0, 0, cssW, cssH);

      const scopeH = Math.round(cssH * 0.66);
      const specTop = scopeH + 8;
      const specH = cssH - specTop - 6;

      // Graticule grid for oscilloscope
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      for (let gx = 1; gx < 10; gx++) {
        const x = (cssW / 10) * gx;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, scopeH);
        ctx.stroke();
      }
      for (let gy = 1; gy < 4; gy++) {
        const y = (scopeH / 4) * gy;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(cssW, y);
        ctx.stroke();
      }

      // Center zero-axis
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.beginPath();
      ctx.moveTo(0, scopeH / 2);
      ctx.lineTo(cssW, scopeH / 2);
      ctx.stroke();

      // Divider between scope & spectrum
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.beginPath();
      ctx.moveTo(0, scopeH + 4);
      ctx.lineTo(cssW, scopeH + 4);
      ctx.stroke();

      const telemetry = audioEngine.getTelemetry();
      if (timeBuffer.length !== telemetry.fftSize) {
        timeBuffer = new Uint8Array(new ArrayBuffer(telemetry.fftSize));
        freqBuffer = new Uint8Array(new ArrayBuffer(telemetry.frequencyBinCount));
      }

      const hasAnalyser = audioEngine.readAnalyser(timeBuffer, freqBuffer);
      const { frequency: targetFreq, waveform: targetWave, isSignalActive: activeProp } = propsRef.current;

      // Compute peak amplitude in time-domain to detect live signal
      let maxDev = 0;
      if (hasAnalyser) {
        for (let i = 0; i < timeBuffer.length; i++) {
          const dev = Math.abs(timeBuffer[i] - 128);
          if (dev > maxDev) maxDev = dev;
        }
      }

      const liveAudio = hasAnalyser && maxDev > 2;

      // Draw reference ghost wave when idle so frequency & shape changes are always visible
      if (!liveAudio) {
        ctx.save();
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.28)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const cyclesOnScreen = (targetFreq / 680) * 5.5;
        const amp = (scopeH * 0.34);
        for (let x = 0; x <= cssW; x += 2) {
          const phase = (x / cssW) * Math.PI * 2 * cyclesOnScreen;
          const y = scopeH / 2 - sampleIdealWave(phase, targetWave) * amp;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      } else {
        // Trigger-stabilized live time-domain waveform from Web Audio AnalyserNode
        let triggerIdx = 0;
        for (let i = 1; i < timeBuffer.length / 2; i++) {
          if (timeBuffer[i - 1] < 128 && timeBuffer[i] >= 128) {
            triggerIdx = i;
            break;
          }
        }

        const samplesToDraw = Math.min(512, timeBuffer.length - triggerIdx);
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < samplesToDraw; i++) {
          const x = (i / (samplesToDraw - 1)) * cssW;
          const v = (timeBuffer[triggerIdx + i] - 128) / 128;
          // Normalize display gain so CW sidetone (volume ~0.16) fills scope cleanly
          const scaled = Math.max(-1, Math.min(1, v * 4.5));
          const y = scopeH / 2 - scaled * (scopeH * 0.4);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Draw Frequency Spectrum (0 - 1600 Hz)
      const maxDisplayHz = 1600;
      const hzPerBin = telemetry.sampleRate / telemetry.fftSize;
      const maxBin = Math.min(freqBuffer.length - 1, Math.ceil(maxDisplayHz / hzPerBin));

      // Target frequency marker line
      const targetX = (targetFreq / maxDisplayHz) * cssW;
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(targetX, specTop);
      ctx.lineTo(targetX, specTop + specH);
      ctx.stroke();

      let peakBin = 0;
      let peakVal = 0;
      const barCount = Math.max(1, maxBin);
      const barW = Math.max(2, cssW / barCount - 1);

      for (let b = 1; b <= maxBin; b++) {
        const val = hasAnalyser ? freqBuffer[b] : 0;
        if (val > peakVal) {
          peakVal = val;
          peakBin = b;
        }
        if (val > 2) {
          const x = (b / maxBin) * cssW;
          const h = (val / 255) * specH;
          ctx.fillStyle = val > 110 ? '#f59e0b' : 'rgba(6, 182, 212, 0.75)';
          ctx.fillRect(x, specTop + specH - h, barW, h);
        }
      }

      // Frequency scale ticks (400, 800, 1200 Hz)
      ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.font = '10px "JetBrains Mono", monospace';
      [400, 800, 1200].forEach((tickHz) => {
        const tx = (tickHz / maxDisplayHz) * cssW;
        ctx.fillText(`${tickHz}Hz`, tx + 3, specTop + 10);
      });

      if (now - lastPeakUpdate > 90) {
        lastPeakUpdate = now;
        if (liveAudio && peakVal > 20 && peakBin > 0) {
          setMeasuredPeakHz(Math.round(peakBin * hzPerBin));
        } else if (!activeProp && !telemetry.isToneActive) {
          setMeasuredPeakHz(null);
        }
      }

      ctx.restore();
      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const periodMs = (1000 / frequency).toFixed(2);
  const activeSignal = isSignalActive || measuredPeakHz !== null;
  const t = UI_TRANSLATIONS[lang].oscillator;

  return (
    <div className="bg-[#111827] border border-white/10 rounded-xl p-6 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2.5">
          <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
          <div>
            <h3 className="font-display text-base font-semibold text-white">{t.title}</h3>
            <p className="text-xs text-slate-400">{t.subtitle}</p>
          </div>
        </div>

        {/* Waveform Selector */}
        <div className="flex items-center gap-1 p-1 bg-[#0A0E17] border border-white/10 rounded-lg self-start">
          {WAVEFORM_IDS.map((wId) => (
            <button
              key={wId}
              type="button"
              onClick={() => {
                onWaveformChange(wId);
                audioEngine.setWaveform(wId);
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                waveform === wId
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {t.waveforms[wId]}
            </button>
          ))}
        </div>
      </div>

      {/* Real-time Oscilloscope + Spectrum Canvas */}
      <div className="rounded-lg overflow-hidden border border-white/10 bg-[#0A0E17]">
        <canvas ref={canvasRef} className="w-full h-[196px] block" />
      </div>

      {/* Tabular Telemetry Readouts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-white/10 text-xs tabular-nums">
        <div>
          <div className="text-slate-400">{t.targetFreq}</div>
          <div className="font-mono text-sm font-semibold text-cyan-300 mt-0.5">{frequency} Hz</div>
        </div>
        <div>
          <div className="text-slate-400">{t.measuredPeak}</div>
          <div className="font-mono text-sm font-semibold text-amber-300 mt-0.5">
            {measuredPeakHz !== null ? `${measuredPeakHz} Hz` : '— Hz'}
          </div>
        </div>
        <div>
          <div className="text-slate-400">{t.wavePeriod}</div>
          <div className="font-mono text-sm font-semibold text-slate-200 mt-0.5">{periodMs} ms</div>
        </div>
        <div>
          <div className="text-slate-400">{t.status}</div>
          <div
            className={`font-mono text-sm font-semibold mt-0.5 ${
              activeSignal ? 'text-amber-300' : 'text-slate-400'
            }`}
          >
            {activeSignal ? t.transmitting : t.standby}
          </div>
        </div>
      </div>
    </div>
  );
};
