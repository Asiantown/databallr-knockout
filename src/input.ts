// FlickInput — turns a pointer drag-flick (mouse / trackpad / touch) into a
// single normalized power number at release. Velocity is measured over the
// last ~90ms before release in viewport-heights/second, so the same wrist
// speed means the same power on any screen size.
//
// Deliberately an interface: a future MediaPipe hand-tracking provider emits
// the same {power} event from wrist-landmark velocity and the game never knows
// the difference.

export interface FlickEvent {
  power: number; // ~1.0 is the ideal shot
}

type FlickListener = (flick: FlickEvent) => void;
type ChargeListener = (power: number) => void;

interface Sample { t: number; y: number; }

// Release velocity (vh/s) that maps to power 1.0.
const CALIBRATION_VH_PER_S = 1.55;
const WINDOW_MS = 90;
const MIN_DRAG_VH = 0.02; // ignore taps
const MAX_POWER = 2.0;

export class FlickInput {
  private samples: Sample[] = [];
  private active = false;
  private enabled = false;
  private onFlick: FlickListener;
  private onCharge: ChargeListener;

  constructor(onFlick: FlickListener, onCharge: ChargeListener) {
    this.onFlick = onFlick;
    this.onCharge = onCharge;
    window.addEventListener('pointerdown', this.handleDown, { passive: false });
    window.addEventListener('pointermove', this.handleMove, { passive: false });
    window.addEventListener('pointerup', this.handleUp, { passive: false });
    window.addEventListener('pointercancel', this.handleUp, { passive: false });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.active = false;
      this.samples = [];
    }
  }

  private handleDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    if ((e.target as HTMLElement)?.closest?.('#overlay')) return; // overlay owns its clicks
    this.active = true;
    this.samples = [{ t: performance.now(), y: e.clientY }];
  };

  private handleMove = (e: PointerEvent): void => {
    if (!this.active) return;
    this.samples.push({ t: performance.now(), y: e.clientY });
    // live meter feedback while dragging
    this.onCharge(this.currentPower());
  };

  private handleUp = (): void => {
    if (!this.active) return;
    this.active = false;
    const power = this.currentPower();
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    this.samples = [];
    if (!first || !last) return;
    const draggedVh = (first.y - last.y) / window.innerHeight;
    if (draggedVh < MIN_DRAG_VH || power <= 0.05) {
      this.onCharge(0);
      return; // a tap / downward drag, not a flick
    }
    this.onFlick({ power });
  };

  // Upward velocity over the trailing window, normalized to power units.
  private currentPower(): number {
    const now = performance.now();
    const recent = this.samples.filter((s) => now - s.t <= WINDOW_MS);
    if (recent.length < 2) return 0;
    const first = recent[0];
    const last = recent[recent.length - 1];
    const dt = (last.t - first.t) / 1000;
    if (dt <= 0) return 0;
    const upVhPerS = (first.y - last.y) / window.innerHeight / dt;
    const power = upVhPerS / CALIBRATION_VH_PER_S;
    return Math.max(0, Math.min(MAX_POWER, power));
  }
}
