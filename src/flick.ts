// Wrist-flick decision + feel tuning, isolated from MediaPipe so it can be unit
// tested in plain Node. Calibrate the constants live (the preview prints the
// numbers); the game imports decideFlick from here.

export const LOOKBACK_MS = 200; // window to measure the upward flick over
export const MIN_RISE = 0.07; // hand must rise at least this fraction of the frame
export const MIN_SPEED = 0.45; // ...at least this fast (frame-heights/sec) to count
export const POWER_CAL = 0.62; // flick speed × this = shot power (≈1.0 is a make)
export const MIN_POWER = 0.55;
export const MAX_POWER = 1.8;
export const COOLDOWN_MS = 650;

export interface FlickSample { t: number; y: number }
export interface FlickDecision { fire: boolean; power: number; speed: number }

// Given the recent wrist-y samples (0=top of frame, 1=bottom), decide whether an
// upward flick just happened and at what power. Frame-rate independent: measures
// net rise + speed over the buffered window, so it holds up even when detection
// is throttled to a low rate.
export function decideFlick(samples: FlickSample[], now: number, lastFire: number): FlickDecision {
  if (samples.length < 2) return { fire: false, power: 0, speed: 0 };
  const oldest = samples[0];
  const y = samples[samples.length - 1].y;
  const dt = (now - oldest.t) / 1000;
  const rise = oldest.y - y; // +y is downward → positive = moved up
  const speed = dt > 0.02 ? rise / dt : 0;
  const fire = rise >= MIN_RISE && speed >= MIN_SPEED && now - lastFire > COOLDOWN_MS;
  const power = fire ? Math.max(MIN_POWER, Math.min(MAX_POWER, speed * POWER_CAL)) : 0;
  return { fire, power, speed: Math.max(0, speed) };
}
