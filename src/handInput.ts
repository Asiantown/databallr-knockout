// Webcam wrist-flick input (the original vision): MediaPipe HandLandmarker tracks
// your hand; a sharp upward flick fires the free throw, with flick speed mapped
// to shot power. Fully opt-in and self-diagnosing (live preview shows the tracked
// hand, a speed bar, and the last flick's numbers for calibration).
//
// Performance: detection is driven by requestVideoFrameCallback and throttled to
// ~30fps, so it runs at most once per camera frame (NOT once per render frame)
// and never piles up. main.ts also drops the bloom pass + pixel ratio while the
// camera is on, freeing the GPU that MediaPipe's delegate needs.
//
// The MediaPipe JS is bundled (version-matched); only the wasm + model are
// fetched from CDN, and only on first enable.
import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import { decideFlick, LOOKBACK_MS, POWER_CAL } from './flick';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const DETECT_MIN_INTERVAL = 42; // throttle detection to ~24fps — plenty for flick capture, easy on the main thread

const BONES: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
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
  private lastDetect = 0;
  private lastVideoTime = -1;
  private samples: Array<{ t: number; y: number }> = [];
  private lastFire = 0;
  private curSpeed = 0;
  private fireFlash = 0;
  private lastShot = 'Flick UP to shoot';

  constructor(
    private onFlick: (power: number) => void,
    private onError: (msg: string) => void,
    private onActive: (active: boolean) => void,
  ) {
    this.video = document.createElement('video');
    this.video.autoplay = true; this.video.playsInline = true; this.video.muted = true;

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
      // Low capture resolution → much faster inference (a flick is gross motion,
      // it doesn't need detail).
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 240 }, height: { ideal: 180 }, facingMode: 'user', frameRate: { ideal: 30 } },
      });
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
      this.onActive(true);
      this.schedule();
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
    this.onActive(false);
  }

  private teardown(): void {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.samples.length = 0;
  }

  // Drive off the camera's frame callback (≤ camera fps) rather than the render
  // loop, and throttle to ~33fps. Falls back to setTimeout where rVFC is absent.
  private schedule(): void {
    if (!this.running) return;
    const rvfc = (this.video as unknown as { requestVideoFrameCallback?: (cb: () => void) => void }).requestVideoFrameCallback;
    if (rvfc) rvfc.call(this.video, () => this.tick());
    else setTimeout(() => this.tick(), DETECT_MIN_INTERVAL);
  }

  private tick(): void {
    if (!this.running) return;
    const now = performance.now();
    if (now - this.lastDetect >= DETECT_MIN_INTERVAL && this.landmarker && this.video.readyState >= 2
        && this.video.currentTime !== this.lastVideoTime) {
      this.lastDetect = now;
      this.lastVideoTime = this.video.currentTime;
      const res = this.landmarker.detectForVideo(this.video, now);
      const hand = res.landmarks?.[0] ?? null;
      // Track the middle-finger knuckle (9) — the hand center. It travels far
      // more with a flick than the wrist (0), which barely moves on a wrist snap.
      if (hand) this.track(hand[9].y, now); else { this.samples.length = 0; this.curSpeed = 0; }
      this.draw(hand);
    }
    this.schedule();
  }

  // Responsive flick: measure the net upward move + speed over a short lookback;
  // fire the moment it clears the thresholds (no "wait for release" latency).
  private track(y: number, now: number): void {
    this.samples.push({ t: now, y });
    while (this.samples.length > 1 && now - this.samples[0].t > LOOKBACK_MS) this.samples.shift();
    const d = decideFlick(this.samples, now, this.lastFire);
    this.curSpeed = d.speed;
    if (d.fire) {
      this.lastFire = now;
      this.fireFlash = now;
      this.lastShot = `flick ${d.speed.toFixed(1)}/s → pow ${d.power.toFixed(2)}`;
      this.samples.length = 0;
      this.curSpeed = 0;
      this.onFlick(d.power);
    }
  }

  private draw(hand: NormalizedLandmark[] | null): void {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    ctx.save();
    ctx.translate(w, 0); ctx.scale(-1, 1);
    ctx.drawImage(this.video, 0, 0, w, h);
    ctx.restore();
    ctx.fillStyle = 'rgba(10,20,40,0.30)';
    ctx.fillRect(0, 0, w, h);

    if (hand) {
      const px = (i: number) => (1 - hand[i].x) * w;
      const py = (i: number) => hand[i].y * h;
      ctx.strokeStyle = 'rgba(96,182,233,0.9)'; ctx.lineWidth = 2;
      for (const [a, b] of BONES) { ctx.beginPath(); ctx.moveTo(px(a), py(a)); ctx.lineTo(px(b), py(b)); ctx.stroke(); }
      ctx.fillStyle = '#f4c84b'; // marker on the tracked point (middle knuckle)
      ctx.beginPath(); ctx.arc(px(9), py(9), 6, 0, Math.PI * 2); ctx.fill();
      this.statusEl.textContent = this.lastShot;
    } else {
      this.statusEl.textContent = 'Show your hand ✋';
    }

    // Speed bar (right edge) with a marker where a make (~power 1.0) lands.
    const norm = Math.max(0, Math.min(1, (this.curSpeed * POWER_CAL) / 1.4));
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(w - 12, 0, 12, h);
    ctx.fillStyle = norm > 0.62 ? '#34d399' : '#60b6e9';
    ctx.fillRect(w - 12, h - norm * h, 12, norm * h);
    const makeY = h - (1.0 / 1.4) * h;
    ctx.fillStyle = '#f4c84b'; ctx.fillRect(w - 12, makeY - 1, 12, 2);

    // Fire flash: green border pulse so a shot is unmistakable.
    if (performance.now() - this.fireFlash < 220) {
      ctx.strokeStyle = '#34d399'; ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, w - 6, h - 6);
    }
  }
}
