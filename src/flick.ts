// Wrist-flick detector + feel tuning, isolated from MediaPipe so it can be unit
// tested in plain Node. The game and the calibration harness share this exact
// class, so they can never drift.
//
// Calibrated from a real recorded flick (scripts/flickframes.ts):
// - The tracked signal is the fingertip's height ABOVE the wrist (landmark 12 vs
//   0). Raising the whole arm keeps it constant → no false shot; only a flick
//   (fingertip snapping down relative to the hand) drops it.
// - Power comes from how far it DROPS in a short window (displacement), NOT peak
//   speed — displacement is frame-rate independent and cleanly separates a real
//   flick (drop ≈0.4) from the hand settling after it (drop ≈0.1).
// - An arm/disarm gate + cooldown prevent the double-fire (snap, then settle).

export const LOOKBACK_MS = 250; // buffer we search (holds the pre-snap high through the snap)
export const MAX_SNAP_MS = 180; // the drop must happen within this long to count as a FLICK (vs a slow settle)
export const MIN_DROP = 0.16; // fingertip must drop ≥ this fraction of the frame to fire
export const POWER_CAL = 2.1; // drop × this = shot power (≈1.0 at a normal flick's ~0.48 drop)
export const MIN_POWER = 0.4;
export const MAX_POWER = 1.6;
export const COOLDOWN_MS = 650;
export const ARM_LEVEL = 0.22; // fingertip must return above the wrist by this much to re-arm

export interface FlickSample { t: number; y: number } // y = signal (fingertip above wrist)
export interface FlickDecision { fire: boolean; power: number; drop: number }

// Biggest downward drop that happens FAST (an earlier sample minus a later one,
// within MAX_SNAP_MS). This is what separates a flick's quick snap from the hand
// slowly settling afterward — the settle's total drop can be large but it's slow.
function fastDrop(samples: FlickSample[]): number {
  let d = 0;
  for (let i = 0; i < samples.length; i += 1) {
    for (let j = i + 1; j < samples.length; j += 1) {
      if (samples[j].t - samples[i].t > MAX_SNAP_MS) continue;
      const drop = samples[i].y - samples[j].y;
      if (drop > d) d = drop;
    }
  }
  return d;
}

export class FlickDetector {
  private samples: FlickSample[] = [];
  private lastFire = -1e9;
  private armed = true;
  private prevDrop = 0;
  private _drop = 0;

  get drop(): number { return this._drop; } // for the live preview bar

  reset(): void { this.samples.length = 0; this.armed = true; this.prevDrop = 0; }

  // Feed one tracked-signal sample; returns whether a flick just fired.
  feed(sig: number, t: number): FlickDecision {
    if (sig > ARM_LEVEL) this.armed = true; // hand returned to ready → can flick again
    this.samples.push({ t, y: sig });
    while (this.samples.length > 1 && t - this.samples[0].t > LOOKBACK_MS) this.samples.shift();
    const drop = fastDrop(this.samples);
    this._drop = drop;
    // Fire when the drop has PLATEAUED (the snap bottomed out) rather than the
    // first frame it crosses the threshold — otherwise we'd capture only the
    // slow start of the snap and read a fraction of the real flick depth.
    const plateaued = drop <= this.prevDrop + 1e-4;
    this.prevDrop = drop;
    if (drop >= MIN_DROP && plateaued && this.armed && t - this.lastFire > COOLDOWN_MS) {
      this.lastFire = t;
      this.armed = false; // disarm until the hand returns to ready (no double-fire)
      this.samples.length = 0;
      this.prevDrop = 0;
      const power = Math.max(MIN_POWER, Math.min(MAX_POWER, drop * POWER_CAL));
      return { fire: true, power, drop };
    }
    return { fire: false, power: 0, drop };
  }
}
