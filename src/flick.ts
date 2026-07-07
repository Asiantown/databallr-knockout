// Wrist-flick decision + feel tuning, isolated from MediaPipe so it can be unit
// tested in plain Node. Calibrate the constants live (the preview prints the
// numbers); the game imports decideFlick from here.
//
// Power comes from the PEAK speed of the flick (the fast middle), not the speed
// at the instant the hand first starts moving — otherwise every flick, fast or
// slow, reads the same low value because it fires on the slow wind-up.

export const LOOKBACK_MS = 260; // buffer window we search for the flick within
export const MIN_RISE = 0.06; // net upward move (fraction of frame height) to count as a flick
export const MIN_SPEED = 0.7; // peak short-window speed (frame-heights/sec) required to fire
export const POWER_CAL = 0.55; // peak speed × this = shot power (≈1.0 at a normal flick's peak)
export const MIN_POWER = 0.4;
export const MAX_POWER = 1.9;
export const COOLDOWN_MS = 600;
const SUBWIN_MIN = 0.04; // sub-window bounds (sec) for the peak-speed search
const SUBWIN_MAX = 0.16;

export interface FlickSample { t: number; y: number }
export interface FlickDecision { fire: boolean; power: number; speed: number }

// Given the recent tracked-point y samples (0=top of frame, 1=bottom), decide
// whether an upward flick just happened and at what power. `speed` is the peak
// upward speed found (also shown in the live readout). Frame-rate independent.
export function decideFlick(samples: FlickSample[], now: number, lastFire: number): FlickDecision {
  if (samples.length < 3) return { fire: false, power: 0, speed: 0 };
  const newest = samples[samples.length - 1];
  const rise = samples[0].y - newest.y; // net upward over the whole buffer

  // Peak upward speed over short sub-windows — the fast core of the flick.
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    for (let j = i + 1; j < samples.length; j += 1) {
      const dt = (samples[j].t - samples[i].t) / 1000;
      if (dt < SUBWIN_MIN || dt > SUBWIN_MAX) continue;
      const v = (samples[i].y - samples[j].y) / dt; // +ve = upward
      if (v > peak) peak = v;
    }
  }

  const fire = rise >= MIN_RISE && peak >= MIN_SPEED && now - lastFire > COOLDOWN_MS;
  const power = fire ? Math.max(MIN_POWER, Math.min(MAX_POWER, peak * POWER_CAL)) : 0;
  return { fire, power, speed: peak };
}
