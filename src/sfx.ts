// Tiny synthesized SFX — no audio assets, just WebAudio oscillators/noise.
// AudioContext resumes on the first user gesture (autoplay policy); mute state
// persists in localStorage.
export class Sfx {
  private ctx: AudioContext | null = null;
  private muted: boolean;

  constructor() {
    this.muted = localStorage.getItem('knockout-muted') === '1';
    const resume = () => {
      this.ensureCtx();
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
    };
    window.addEventListener('pointerdown', resume, { passive: true });
    window.addEventListener('keydown', resume);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem('knockout-muted', this.muted ? '1' : '0');
    return this.muted;
  }

  private ensureCtx(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        this.ctx = null;
      }
    }
    return this.ctx;
  }

  private tone(freq: number, durationS: number, type: OscillatorType, gainPeak: number, whenS = 0, glideTo?: number): void {
    if (this.muted) return;
    const ctx = this.ensureCtx();
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + whenS;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + durationS);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(gainPeak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationS);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durationS + 0.05);
  }

  private noise(durationS: number, filterFrom: number, filterTo: number, gainPeak: number): void {
    if (this.muted) return;
    const ctx = this.ensureCtx();
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime;
    const frames = Math.floor(ctx.sampleRate * durationS);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFrom, t0);
    filter.frequency.exponentialRampToValueAtTime(filterTo, t0 + durationS);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainPeak, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationS);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t0);
  }

  swish(): void {
    this.noise(0.28, 2400, 700, 0.22);
  }

  rim(): void {
    this.tone(210, 0.16, 'square', 0.16);
    this.tone(316, 0.11, 'square', 0.1, 0.012);
  }

  bounce(): void {
    this.tone(95, 0.12, 'sine', 0.2, 0, 55);
  }

  yourBall(): void {
    this.tone(523, 0.09, 'triangle', 0.14);
    this.tone(784, 0.14, 'triangle', 0.14, 0.09);
  }

  knockout(): void {
    this.tone(330, 0.16, 'sawtooth', 0.12, 0, 262);
    this.tone(262, 0.28, 'sawtooth', 0.12, 0.14, 165);
  }

  champion(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.14, i * 0.11));
  }
}
