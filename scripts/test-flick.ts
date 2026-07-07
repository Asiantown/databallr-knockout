// Unit test for the wrist-flick decision. Run: npm run test:flick
// Key property: power tracks the PEAK speed of the flick, so fast vs slow vs
// medium flicks produce clearly different power (the bug was "always the same").
import { decideFlick, MIN_RISE, MIN_SPEED, COOLDOWN_MS } from '../src/flick.ts';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass += 1; console.log(`  ok   ${name} ${detail}`); }
  else { fail += 1; console.log(`  FAIL ${name} ${detail}`); }
}
const s = (pts: number[][]) => pts.map(([t, y]) => ({ t, y }));

// Realistic ~24fps samples (42ms apart) with a fast core in the middle of the flick.
const FAST = s([[0, 0.62], [42, 0.60], [84, 0.47], [126, 0.34], [168, 0.30], [210, 0.29]]);
const MED = s([[0, 0.62], [42, 0.60], [84, 0.53], [126, 0.46], [168, 0.42], [210, 0.40]]);
const SLOW = s([[0, 0.62], [42, 0.605], [84, 0.585], [126, 0.565], [168, 0.55], [210, 0.54]]);
const STILL = s([[0, 0.5], [42, 0.501], [84, 0.499], [126, 0.5], [168, 0.502], [210, 0.5]]);
const DOWN = s([[0, 0.30], [84, 0.45], [168, 0.60]]);

const fast = decideFlick(FAST, 210, -9999);
const med = decideFlick(MED, 210, -9999);
const slow = decideFlick(SLOW, 210, -9999);

check('fast flick fires', fast.fire, `(peak=${fast.speed.toFixed(1)} pow=${fast.power.toFixed(2)})`);
check('medium flick fires', med.fire, `(peak=${med.speed.toFixed(1)} pow=${med.power.toFixed(2)})`);
check('DISCRIMINATION: fast > medium power', fast.power > med.power + 0.15, `fast=${fast.power.toFixed(2)} med=${med.power.toFixed(2)}`);
check('DISCRIMINATION: medium > slow-ish power', med.power > slow.power, `med=${med.power.toFixed(2)} slow=${slow.power.toFixed(2)}`);
check('medium flick is roughly makeable', med.power > 0.75 && med.power < 1.25, `pow=${med.power.toFixed(2)}`);

check('still hand does not fire', !decideFlick(STILL, 210, -9999).fire);
check('downward move does not fire', !decideFlick(DOWN, 168, -9999).fire);

// Cooldown
check('flick within cooldown suppressed', !decideFlick(FAST, 210, 210 - (COOLDOWN_MS - 100)).fire);
check('flick after cooldown fires', decideFlick(FAST, 210, 210 - (COOLDOWN_MS + 100)).fire);

// Very hard flick clamps power at MAX.
const HARD = s([[0, 0.95], [42, 0.7], [84, 0.35], [126, 0.05]]);
const hard = decideFlick(HARD, 126, -9999);
check('hard flick fires and clamps ≤1.9', hard.fire && hard.power <= 1.9, `pow=${hard.power.toFixed(2)}`);

console.log(`\n${pass} passed, ${fail} failed  (MIN_SPEED=${MIN_SPEED}, MIN_RISE=${MIN_RISE})`);
console.log(`  feel: slow→${slow.power.toFixed(2)}  medium→${med.power.toFixed(2)}  fast→${fast.power.toFixed(2)}  hard→${hard.power.toFixed(2)}  (green≈1.0)`);
process.exit(fail ? 1 : 0);
