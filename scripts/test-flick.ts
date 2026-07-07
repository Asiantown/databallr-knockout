// Unit test for the wrist-flick decision. Run:
//   node --experimental-strip-types scripts/test-flick.ts
import { decideFlick, MIN_RISE, MIN_SPEED, COOLDOWN_MS } from '../src/flick.ts';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass += 1; console.log(`  ok   ${name} ${detail}`); }
  else { fail += 1; console.log(`  FAIL ${name} ${detail}`); }
}
const s = (pts: number[][]) => pts.map(([t, y]) => ({ t, y }));

// 1) A real upward flick: hand rises ~0.30 of the frame over 200ms (≈30fps).
{
  const w = s([[0, 0.63], [33, 0.58], [66, 0.51], [100, 0.45], [133, 0.39], [166, 0.35], [200, 0.33]]);
  const d = decideFlick(w, 200, -9999);
  check('real flick fires', d.fire, `(speed=${d.speed.toFixed(2)} power=${d.power.toFixed(2)})`);
  check('flick power is makeable', d.power > 0.7 && d.power < 1.3, `power=${d.power.toFixed(2)}`);
}

// 2) A gentle raise: same distance but over ~1s — should NOT fire (too slow).
{
  const w = s([[0, 0.50], [200, 0.48]]); // within a 200ms window, barely moved
  const d = decideFlick(w, 200, -9999);
  check('slow/small move does not fire', !d.fire, `(speed=${d.speed.toFixed(2)} rise<${MIN_RISE})`);
}

// 3) Hand held still (jitter): no fire.
{
  const w = s([[0, 0.5], [33, 0.502], [66, 0.499], [100, 0.5], [200, 0.501]]);
  const d = decideFlick(w, 200, -9999);
  check('still hand does not fire', !d.fire);
}

// 4) Downward motion (lowering hand): no fire.
{
  const w = s([[0, 0.3], [100, 0.45], [200, 0.6]]);
  const d = decideFlick(w, 200, -9999);
  check('downward move does not fire', !d.fire);
}

// 5) Cooldown: a valid flick too soon after the last fire is suppressed.
{
  const w = s([[0, 0.63], [100, 0.45], [200, 0.33]]);
  const d = decideFlick(w, 200, 200 - (COOLDOWN_MS - 100)); // fired 550ms ago (< 650 cooldown)
  check('flick within cooldown suppressed', !d.fire);
  const d2 = decideFlick(w, 200, 200 - (COOLDOWN_MS + 100)); // fired 750ms ago (> cooldown)
  check('flick after cooldown fires', d2.fire);
}

// 6) A hard flick clamps power (doesn't exceed MAX).
{
  const w = s([[0, 0.9], [80, 0.4], [160, 0.05]]); // huge fast rise
  const d = decideFlick(w, 160, -9999);
  check('hard flick fires and clamps', d.fire && d.power <= 1.8, `power=${d.power.toFixed(2)}`);
}

console.log(`\n${pass} passed, ${fail} failed  (MIN_SPEED=${MIN_SPEED}, MIN_RISE=${MIN_RISE})`);
process.exit(fail ? 1 : 0);
