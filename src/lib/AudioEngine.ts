export type AudioMode = 'autopilot' | 'mic';

export type ReactiveState = {
  bass: number;
  flow: number;
  shimmer: number;
  energy: number;
  impulse: number;
  mode: AudioMode;
  micAvailable: boolean;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function lerp(current: number, target: number, factor: number) {
  return current + (target - current) * factor;
}

export class AudioEngine {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private data: Uint8Array | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private mode: AudioMode = 'autopilot';
  private micAvailable = false;
  private lastSignalAt = 0;
  private impulse = 0;
  private state = {
    bass: 0.18,
    flow: 0.22,
    shimmer: 0.1,
    energy: 0.2,
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
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.84;

      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);

      this.context = context;
      this.analyser = analyser;
      this.data = new Uint8Array(analyser.frequencyBinCount);
      this.source = source;
      this.stream = stream;
      this.mode = 'mic';
      this.micAvailable = true;
      this.lastSignalAt = performance.now();
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
    this.data = null;
    this.context?.close();
    this.context = null;
    this.mode = 'autopilot';
  }

  triggerImpulse(strength = 0.32) {
    this.impulse = Math.max(this.impulse, strength);
  }

  getMode() {
    return this.mode;
  }

  getReactiveState(time: number): ReactiveState {
    const now = performance.now();
    const auto = this.computeAutopilot(time);
    let target = auto;

    if (this.mode === 'mic' && this.analyser && this.data) {
      this.analyser.getByteFrequencyData(this.data as unknown as Uint8Array<ArrayBuffer>);
      const bins = this.data;

      let bass = 0;
      let lowMid = 0;
      let high = 0;
      let energy = 0;

      const bassEnd = 8;
      const lowMidStart = 8;
      const lowMidEnd = 54;
      const highStart = 54;
      const highEnd = Math.min(180, bins.length);

      for (let i = 0; i < bassEnd; i += 1) bass += bins[i];
      for (let i = lowMidStart; i < lowMidEnd; i += 1) lowMid += bins[i];
      for (let i = highStart; i < highEnd; i += 1) high += bins[i];
      for (let i = 0; i < bins.length; i += 1) energy += bins[i];

      bass = bass / bassEnd / 255;
      lowMid = lowMid / (lowMidEnd - lowMidStart) / 255;
      high = high / (highEnd - highStart) / 255;
      energy = energy / bins.length / 255;

      const gatedEnergy = Math.max(0, energy - 0.022);
      const silent = gatedEnergy < 0.014;
      if (!silent) this.lastSignalAt = now;

      const silenceBlend = clamp((now - this.lastSignalAt - 400) / 1600);

      target = {
        bass: clamp(bass * 1.45 + auto.bass * silenceBlend * 0.55),
        flow: clamp(lowMid * 1.55 + auto.flow * silenceBlend * 0.7),
        shimmer: clamp(high * 1.7 + auto.shimmer * silenceBlend * 0.75),
        energy: clamp(gatedEnergy * 1.5 + auto.energy * silenceBlend * 0.65),
      };
    }

    this.state.bass = lerp(this.state.bass, target.bass, 0.045);
    this.state.flow = lerp(this.state.flow, target.flow, 0.05);
    this.state.shimmer = lerp(this.state.shimmer, target.shimmer, 0.08);
    this.state.energy = lerp(this.state.energy, target.energy, 0.055);
    this.impulse = lerp(this.impulse, 0, 0.065);

    return {
      ...this.state,
      impulse: this.impulse,
      mode: this.mode,
      micAvailable: this.micAvailable,
    };
  }

  private computeAutopilot(time: number) {
    const bass =
      0.2 +
      0.11 * (Math.sin(time * 0.55) * 0.5 + 0.5) +
      0.06 * (Math.sin(time * 0.14 + 1.4) * 0.5 + 0.5);
    const flow =
      0.22 +
      0.1 * (Math.sin(time * 0.27 + 0.8) * 0.5 + 0.5) +
      0.04 * (Math.sin(time * 0.91 + 0.5) * 0.5 + 0.5);
    const shimmer =
      0.08 +
      0.05 * (Math.sin(time * 0.73 + 2.1) * 0.5 + 0.5) +
      0.03 * (Math.sin(time * 1.31 + 0.3) * 0.5 + 0.5);
    const energy = 0.16 + 0.08 * (Math.sin(time * 0.18 + 2.8) * 0.5 + 0.5);

    return {
      bass: clamp(bass),
      flow: clamp(flow),
      shimmer: clamp(shimmer),
      energy: clamp(energy),
    };
  }
}
