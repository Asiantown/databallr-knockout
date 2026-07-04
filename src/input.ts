// FlickInput — three ways to shoot, one number out (release power ~1.0 ideal):
//   1. Pointer drag-flick (mouse / touch): upward drag velocity at release.
//   2. Trackpad two-finger swipe (wheel burst): peak scroll velocity, direction
//      agnostic so macOS "natural scrolling" users aren't punished.
//   3. Hold SPACE to charge, release to shoot (keyboard / accessibility path).
//
// All three feed the same {power} event; a future MediaPipe hand-tracking
// provider slots in the same way. Too-soft inputs do NOT fire a wasted shot —
// they emit onTooSoft so the game can coach instead of airballing.

export interface FlickEvent {
  power: number; // ~1.0 is the ideal shot
}

type FlickListener = (flick: FlickEvent) => void;
type ChargeListener = (power: number) => void;
type TooSoftListener = () => void;

interface Sample { t: number; y: number; }

const DRAG_CALIBRATION_VH_PER_S = 1.55;
const WHEEL_CALIBRATION_PX_PER_S = 3200;
const SPACE_CHARGE_PER_S = 1.4;
const WINDOW_MS = 90;
const WHEEL_WINDOW_MS = 110;
const WHEEL_QUIET_MS = 80;
const MIN_POWER = 0.25; // below this: coach, don't shoot
const MAX_POWER = 2.0;
const POST_SHOT_COOLDOWN_MS = 350;

export class FlickInput {
  private samples: Sample[] = [];
  private dragActive = false;
  private enabled = false;
  private onFlick: FlickListener;
  private onCharge: ChargeListener;
  private onTooSoft: TooSoftListener;
  private lastFiredAt = 0;

  // wheel burst state
  private wheelEvents: Sample[] = []; // y = |deltaY|
  private wheelPeak = 0;
  private wheelArmed = true;
  private wheelTimer: number | undefined;

  // space charge state
  private charging = false;
  private chargeStart = 0;
  private chargeRaf = 0;

  constructor(onFlick: FlickListener, onCharge: ChargeListener, onTooSoft: TooSoftListener) {
    this.onFlick = onFlick;
    this.onCharge = onCharge;
    this.onTooSoft = onTooSoft;
    window.addEventListener('pointerdown', this.handleDown, { passive: false });
    window.addEventListener('pointermove', this.handleMove, { passive: false });
    window.addEventListener('pointerup', this.handleUp, { passive: false });
    window.addEventListener('pointercancel', this.handleUp, { passive: false });
    window.addEventListener('wheel', this.handleWheel, { passive: false });
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.dragActive = false;
      this.samples = [];
      this.stopCharge(false);
      // Any wheel momentum still rolling must not fire the next shot: require
      // a fresh, quiet-separated burst before re-arming.
      this.wheelArmed = false;
      this.wheelEvents = [];
      this.wheelPeak = 0;
    }
  }

  private coolingDown(): boolean {
    return performance.now() - this.lastFiredAt < POST_SHOT_COOLDOWN_MS;
  }

  private fire(power: number): void {
    if (!this.enabled || this.coolingDown()) return;
    if (power < MIN_POWER) {
      this.onCharge(0);
      this.onTooSoft();
      return;
    }
    this.lastFiredAt = performance.now();
    this.onFlick({ power: Math.min(MAX_POWER, power) });
  }

  // --- pointer drag ---------------------------------------------------------

  private handleDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    if ((e.target as HTMLElement)?.closest?.('#overlay, button')) return;
    this.dragActive = true;
    this.samples = [{ t: performance.now(), y: e.clientY }];
  };

  private handleMove = (e: PointerEvent): void => {
    if (!this.dragActive) return;
    // Browsers coalesce fast drags into few pointermove events; the coalesced
    // list restores the true motion samples so flick velocity stays accurate.
    const coalesced = e.getCoalescedEvents?.() ?? [];
    if (coalesced.length > 0) {
      for (const ce of coalesced) this.samples.push({ t: ce.timeStamp || performance.now(), y: ce.clientY });
    } else {
      this.samples.push({ t: performance.now(), y: e.clientY });
    }
    this.onCharge(this.dragPower());
  };

  private handleUp = (): void => {
    if (!this.dragActive) return;
    this.dragActive = false;
    const power = this.dragPower();
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    this.samples = [];
    this.onCharge(0);
    if (!first || !last) return;
    const draggedVh = (first.y - last.y) / window.innerHeight;
    if (draggedVh < 0.015) return; // a click, not a flick attempt
    this.fire(power);
  };

  private dragPower(): number {
    if (this.samples.length < 2) return 0;
    const lastSample = this.samples[this.samples.length - 1];
    // Anchor the velocity window to the LAST MOVE, not the release moment —
    // pointerup often lags the final move (finger leaves the trackpad), and a
    // release-anchored window would see one sample and misread the flick as 0.
    const recent = this.samples.filter((s) => lastSample.t - s.t <= WINDOW_MS);
    const first = recent.length >= 2 ? recent[0] : this.samples[0];
    const dt = (lastSample.t - first.t) / 1000;
    if (dt <= 0) return 0;
    const upVhPerS = (first.y - lastSample.y) / window.innerHeight / dt;
    return Math.max(0, Math.min(MAX_POWER, upVhPerS / DRAG_CALIBRATION_VH_PER_S));
  }

  // --- trackpad two-finger swipe (wheel burst) --------------------------------

  private handleWheel = (e: WheelEvent): void => {
    if (this.enabled) e.preventDefault();
    if (!this.enabled || this.coolingDown()) return;
    const now = performance.now();
    const gap = this.wheelEvents.length ? now - this.wheelEvents[this.wheelEvents.length - 1].t : Infinity;
    if (!this.wheelArmed) {
      // Momentum tail from a consumed swipe: re-arm only after a real pause.
      if (gap >= 160) this.wheelArmed = true;
      else { this.trackWheel(now, e); return; }
    }
    this.trackWheel(now, e);
    const velocity = this.wheelVelocity(now);
    this.wheelPeak = Math.max(this.wheelPeak, velocity);
    this.onCharge(Math.min(MAX_POWER, this.wheelPeak / WHEEL_CALIBRATION_PX_PER_S));

    window.clearTimeout(this.wheelTimer);
    const fireFromBurst = () => {
      const power = this.wheelPeak / WHEEL_CALIBRATION_PX_PER_S;
      this.wheelPeak = 0;
      this.wheelEvents = [];
      this.wheelArmed = false; // ignore momentum tail until a quiet gap
      this.onCharge(0);
      this.fire(power);
    };
    // Fire when the burst goes quiet, or immediately once decay is obvious.
    if (this.wheelPeak > 0 && velocity < this.wheelPeak * 0.3) {
      fireFromBurst();
      return;
    }
    this.wheelTimer = window.setTimeout(fireFromBurst, WHEEL_QUIET_MS);
  };

  private trackWheel(now: number, e: WheelEvent): void {
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
    this.wheelEvents.push({ t: now, y: Math.abs(e.deltaY) * scale });
    while (this.wheelEvents.length && now - this.wheelEvents[0].t > WHEEL_WINDOW_MS) this.wheelEvents.shift();
  }

  private wheelVelocity(now: number): number {
    if (!this.wheelEvents.length) return 0;
    const windowStart = Math.min(this.wheelEvents[0].t, now - 1);
    const total = this.wheelEvents.reduce((sum, s) => sum + s.y, 0);
    const span = Math.max(24, now - windowStart);
    return (total / span) * 1000; // px/s
  }

  // --- keyboard charge ---------------------------------------------------------

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'Space' || e.repeat) return;
    if (!this.enabled || this.coolingDown()) return;
    e.preventDefault();
    this.charging = true;
    this.chargeStart = performance.now();
    const tick = () => {
      if (!this.charging) return;
      this.onCharge(this.chargePower());
      this.chargeRaf = requestAnimationFrame(tick);
    };
    this.chargeRaf = requestAnimationFrame(tick);
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    if (e.code !== 'Space' || !this.charging) return;
    e.preventDefault();
    const power = this.chargePower();
    this.stopCharge(true);
    this.fire(power);
  };

  private chargePower(): number {
    return Math.min(MAX_POWER, ((performance.now() - this.chargeStart) / 1000) * SPACE_CHARGE_PER_S);
  }

  private stopCharge(resetMeter: boolean): void {
    this.charging = false;
    cancelAnimationFrame(this.chargeRaf);
    if (resetMeter) this.onCharge(0);
  }
}
