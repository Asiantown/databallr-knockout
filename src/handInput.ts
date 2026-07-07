// Webcam wrist-flick input (the original vision): MediaPipe HandLandmarker tracks
// your hand; a sharp upward flick fires the free throw, with peak vertical speed
// mapped to shot power. Fully opt-in (camera only starts when enabled) and
// self-diagnosing: a live preview shows the tracked hand + a power bar + the last
// flick's numbers so feel can be calibrated by watching, not guessing.
//
// The MediaPipe JS is bundled (version-matched); only the ~11MB wasm + ~7.5MB
// model are fetched from Google/jsDelivr CDNs, and only on first enable.
import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// --- feel tuning (calibrate live; the preview prints vel→power) --------------
const FIRE_THRESH = 1.15; // upward speed (normalized frame-heights/sec) to arm a flick
const RELEASE_FRAC = 0.35; // fire when speed drops back below FIRE_THRESH*this
const POWER_CAL = 0.52; // peak upward speed × this = shot power (≈1.0 is a make)
const MAX_POWER = 2.0;
const COOLDOWN_MS = 900;
const VEL_WINDOW_MS = 120;

// Hand-skeleton connections (subset of MediaPipe's 21-point hand) for the overlay.
const BONES: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], // thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // index
  [5, 9], [9, 10], [10, 11], [11, 12], // middle
  [9, 13], [13, 14], [14, 15], [15, 16], // ring
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17], // pinky + palm
];

export class HandFlickInput {
  private landmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement;
  private stream: MediaStream | null = null;
  private wrap: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private statusEl: HTMLDivElement;
  private running = false;
  private lastVideoTime = -1;
  private samples: Array<{ t: number; y: number }> = [];
  private flicking = false;
  private peakVel = 0;
  private lastFire = 0;
  private lastShot = ''; // debug readout

  constructor(private onFlick: (power: number) => void, private onError: (msg: string) => void) {
    this.video = document.createElement('video');
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.muted = true;

    this.wrap = document.createElement('div');
    this.wrap.className = 'cam-preview';
    this.wrap.style.display = 'none';
    this.canvas = document.createElement('canvas');
    this.canvas.width = 240; this.canvas.height = 180;
    this.statusEl = document.createElement('div');
    this.statusEl.className = 'cam-status';
    this.statusEl.textContent = 'Flick UP to shoot';
    this.wrap.append(this.canvas, this.statusEl);
    document.getElementById('hud')?.appendChild(this.wrap);
    this.ctx = this.canvas.getContext('2d')!;
  }

  get active(): boolean { return this.running; }

  async enable(): Promise<boolean> {
    try {
      this.statusEl.textContent = 'Starting camera…';
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' } });
      this.video.srcObject = this.stream;
      await this.video.play();
      if (!this.landmarker) {
        this.statusEl.textContent = 'Loading hand tracker…';
        const vision = await FilesetResolver.forVisionTasks(WASM);
        this.landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
          numHands: 1,
          runningMode: 'VIDEO',
        });
      }
      this.running = true;
      this.wrap.style.display = 'block';
      this.statusEl.textContent = 'Flick UP to shoot';
      requestAnimationFrame(this.loop);
      return true;
    } catch (err) {
      this.onError(err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Camera blocked — allow it, or use swipe/space'
        : 'Camera/hand-tracking unavailable — using swipe/space');
      this.teardown();
      return false;
    }
  }

  disable(): void {
    this.teardown();
    this.wrap.style.display = 'none';
  }

  private teardown(): void {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.samples.length = 0;
    this.flicking = false;
  }

  private loop = (): void => {
    if (!this.running) return;
    const now = performance.now();
    if (this.landmarker && this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const res = this.landmarker.detectForVideo(this.video, now);
      const hand = res.landmarks?.[0] ?? null;
      if (hand) this.track(hand[0].y, now); else { this.samples.length = 0; this.flicking = false; }
      this.draw(hand, now);
    }
    requestAnimationFrame(this.loop);
  };

  // Upward-velocity flick detector: arm above a speed threshold, fire on release
  // (deceleration) with the peak speed → power.
  private track(y: number, now: number): void {
    this.samples.push({ t: now, y });
    while (this.samples.length > 1 && now - this.samples[0].t > VEL_WINDOW_MS) this.samples.shift();
    const first = this.samples[0];
    const dt = (now - first.t) / 1000;
    const vel = dt > 0 ? (first.y - y) / dt : 0; // +y is downward in image space → (first-y) up

    if (!this.flicking) {
      if (vel > FIRE_THRESH) { this.flicking = true; this.peakVel = vel; }
    } else {
      this.peakVel = Math.max(this.peakVel, vel);
      if (vel < FIRE_THRESH * RELEASE_FRAC) {
        if (now - this.lastFire > COOLDOWN_MS) {
          const power = Math.min(MAX_POWER, this.peakVel * POWER_CAL);
          this.lastFire = now;
          this.lastShot = `flick ${this.peakVel.toFixed(1)}/s → pow ${power.toFixed(2)}`;
          this.onFlick(power);
        }
        this.flicking = false;
      }
    }
    this.currentVel = vel;
  }

  private currentVel = 0;

  private draw(hand: NormalizedLandmark[] | null, now: number): void {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    // mirrored video (selfie view)
    ctx.save();
    ctx.translate(w, 0); ctx.scale(-1, 1);
    ctx.drawImage(this.video, 0, 0, w, h);
    ctx.restore();
    ctx.fillStyle = 'rgba(10,20,40,0.35)';
    ctx.fillRect(0, 0, w, h);

    if (hand) {
      const px = (i: number) => ((1 - hand[i].x) * w); // mirror x to match video
      const py = (i: number) => (hand[i].y * h);
      ctx.strokeStyle = 'rgba(96,182,233,0.9)'; ctx.lineWidth = 2;
      for (const [a, b] of BONES) { ctx.beginPath(); ctx.moveTo(px(a), py(a)); ctx.lineTo(px(b), py(b)); ctx.stroke(); }
      ctx.fillStyle = '#f4c84b';
      ctx.beginPath(); ctx.arc(px(0), py(0), 5, 0, Math.PI * 2); ctx.fill(); // wrist
      this.statusEl.textContent = this.lastShot || 'Flick UP to shoot';
    } else {
      this.statusEl.textContent = 'Show your hand ✋';
    }

    // power bar (right edge): live upward speed, and a marker where a make lands
    const level = Math.max(0, Math.min(1, (this.flicking ? this.peakVel : this.currentVel) * POWER_CAL / 1.5));
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(w - 12, 0, 12, h);
    ctx.fillStyle = this.flicking ? '#34d399' : '#60b6e9';
    ctx.fillRect(w - 12, h - level * h, 12, level * h);
    const makeY = h - (1.0 * POWER_CAL / 1.5) * h; // where power≈1.0 sits
    ctx.fillStyle = '#f4c84b'; ctx.fillRect(w - 12, makeY - 1, 12, 2);
    void now;
  }
}
