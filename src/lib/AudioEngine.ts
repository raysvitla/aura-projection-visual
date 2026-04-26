export type AudioMode = 'autopilot' | 'mic';

export type AudioFrame = {
  sub: number;
  lowMid: number;
  high: number;
  rms: number;
  spectralFlux: number;
  onset: boolean;
  silenceMs: number;
  impulse: number;
  mode: AudioMode;
  micAvailable: boolean;
  // backwards-compatible aliases used by older callers / debug state
  bass: number;
  flow: number;
  shimmer: number;
  energy: number;
};

export type ReactiveState = AudioFrame;

type BandState = Pick<AudioFrame, 'sub' | 'lowMid' | 'high' | 'rms' | 'spectralFlux'>;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function lerp(current: number, target: number, factor: number) {
  return current + (target - current) * factor;
}

function averageBins(bins: Uint8Array, start: number, end: number) {
  let total = 0;
  const safeEnd = Math.max(start + 1, Math.min(end, bins.length));
  for (let i = start; i < safeEnd; i += 1) total += bins[i];
  return total / (safeEnd - start) / 255;
}

const EMPTY_FRAME: AudioFrame = {
  sub: 0.18,
  lowMid: 0.2,
  high: 0.08,
  rms: 0.2,
  spectralFlux: 0,
  onset: false,
  silenceMs: 0,
  impulse: 0,
  mode: 'autopilot',
  micAvailable: false,
  bass: 0.18,
  flow: 0.2,
  shimmer: 0.08,
  energy: 0.2,
};

export class AudioEngine {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private frequencyData: Uint8Array | null = null;
  private timeData: Uint8Array | null = null;
  private previousFrequency: Uint8Array | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private mode: AudioMode = 'autopilot';
  private micAvailable = false;
  private silenceStartedAt: number | null = null;
  private lastOnsetAt = 0;
  private lastAutoBeat = -1;
  private impulse = 0;
  private frame: BandState = {
    sub: EMPTY_FRAME.sub,
    lowMid: EMPTY_FRAME.lowMid,
    high: EMPTY_FRAME.high,
    rms: EMPTY_FRAME.rms,
    spectralFlux: 0,
  };

  async enableMic() {
    if (this.mode === 'mic' && this.context) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        autoGainControl: false,
        noiseSuppression: false,
      },
    });

    try {
      const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) throw new Error('AudioContext unavailable');

      const context = new Context();
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.82;

      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);

      this.context = context;
      this.analyser = analyser;
      this.frequencyData = new Uint8Array(analyser.frequencyBinCount);
      this.timeData = new Uint8Array(analyser.fftSize);
      this.previousFrequency = new Uint8Array(analyser.frequencyBinCount);
      this.source = source;
      this.stream = stream;
      this.mode = 'mic';
      this.micAvailable = true;
      this.silenceStartedAt = null;
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      throw error;
    }
  }

  disableMic() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.source?.disconnect();
    this.source = null;
    this.analyser?.disconnect();
    this.analyser = null;
    this.frequencyData = null;
    this.timeData = null;
    this.previousFrequency = null;
    void this.context?.close();
    this.context = null;
    this.mode = 'autopilot';
  }

  triggerImpulse(strength = 0.4) {
    this.impulse = Math.max(this.impulse, strength);
    this.lastOnsetAt = 0;
  }

  getMode() {
    return this.mode;
  }

  getReactiveState(time: number): AudioFrame {
    const now = performance.now();
    const target = this.mode === 'mic' ? this.computeMicFrame(time, now) : this.computeAutopilotFrame(time, now);

    this.frame.sub = lerp(this.frame.sub, target.sub, 0.08);
    this.frame.lowMid = lerp(this.frame.lowMid, target.lowMid, 0.055);
    this.frame.high = lerp(this.frame.high, target.high, 0.11);
    this.frame.rms = lerp(this.frame.rms, target.rms, 0.08);
    this.frame.spectralFlux = lerp(this.frame.spectralFlux, target.spectralFlux, 0.12);

    const impulseOnset = this.impulse > 0.18;
    const onset = target.spectralFlux > 0.22 && now - this.lastOnsetAt > 520;
    if (onset || impulseOnset) this.lastOnsetAt = now;

    const silent = this.frame.rms < 0.025;
    if (silent) this.silenceStartedAt ??= now;
    else this.silenceStartedAt = null;

    const silenceMs = this.silenceStartedAt === null ? 0 : now - this.silenceStartedAt;
    this.impulse = lerp(this.impulse, 0, 0.055);

    return {
      ...this.frame,
      onset: onset || impulseOnset,
      silenceMs,
      impulse: this.impulse,
      mode: this.mode,
      micAvailable: this.micAvailable,
      bass: this.frame.sub,
      flow: this.frame.lowMid,
      shimmer: this.frame.high,
      energy: this.frame.rms,
    };
  }

  private computeMicFrame(_time: number, now: number): BandState {
    if (!this.analyser || !this.frequencyData || !this.timeData || !this.previousFrequency) {
      return this.computeAutopilotFrame(now * 0.001, now);
    }

    this.analyser.getByteFrequencyData(this.frequencyData as unknown as Uint8Array<ArrayBuffer>);
    this.analyser.getByteTimeDomainData(this.timeData as unknown as Uint8Array<ArrayBuffer>);

    const bins = this.frequencyData;
    const sub = averageBins(bins, 2, 14);
    const lowMid = averageBins(bins, 14, 70);
    const high = averageBins(bins, 190, Math.min(470, bins.length));

    let rmsTotal = 0;
    for (let i = 0; i < this.timeData.length; i += 1) {
      const sample = (this.timeData[i] - 128) / 128;
      rmsTotal += sample * sample;
    }
    const rms = clamp(Math.sqrt(rmsTotal / this.timeData.length) * 2.2);

    let flux = 0;
    for (let i = 0; i < bins.length; i += 1) {
      flux += Math.max(0, bins[i] - this.previousFrequency[i]);
      this.previousFrequency[i] = bins[i];
    }
    const spectralFlux = clamp(flux / bins.length / 64);

    return {
      sub: clamp(sub * 1.45),
      lowMid: clamp(lowMid * 1.35),
      high: clamp(high * 1.7),
      rms,
      spectralFlux,
    };
  }

  private computeAutopilotFrame(time: number, now: number): BandState {
    const beatPeriod = 60 / 142;
    const beat = Math.floor(time / beatPeriod);
    const beatPhase = (time % beatPeriod) / beatPeriod;
    const kick = Math.exp(-beatPhase * 9.5);
    const onset = beat !== this.lastAutoBeat;
    if (onset) this.lastAutoBeat = beat;

    const longA = Math.sin(time * 0.045) * 0.5 + 0.5;
    const longB = Math.sin(time * 0.071 + 1.7) * 0.5 + 0.5;
    const drift = Math.sin(time * 0.19 + 0.8) * 0.5 + 0.5;

    const sub = clamp(0.2 + kick * 0.42 + longA * 0.18 + this.impulse * 0.35);
    const lowMid = clamp(0.22 + longB * 0.28 + Math.sin(time * 0.31) * 0.06 + this.impulse * 0.18);
    const high = clamp(0.08 + drift * 0.18 + Math.max(0, Math.sin(time * 1.9)) * 0.06 + this.impulse * 0.18);
    const rms = clamp(0.18 + sub * 0.38 + lowMid * 0.24);
    const spectralFlux = onset && now - this.lastOnsetAt > 520 ? 0.34 : 0.04 + high * 0.04;

    return { sub, lowMid, high, rms, spectralFlux };
  }
}
