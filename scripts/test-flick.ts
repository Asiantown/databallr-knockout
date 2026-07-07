// Unit test for the wrist-flick detector (stateful, shared with the game).
// Run: npm run test:flick
// Modeled on the real recorded flick: ready(sig≈0.42) → snap down(≈0.05) →
// recover(≈0.45) → settle(≈0.33). The critical property is ONE fire per flick.
import { FlickDetector, MIN_DROP } from '../src/flick.ts';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass += 1; console.log(`  ok   ${name} ${detail}`); }
  else { fail += 1; console.log(`  FAIL ${name} ${detail}`); }
}

// Feed a sig timeseries (33ms steps) through a detector; return fires + powers.
function run(sig: number[]): { fires: number; powers: number[] } {
  const det = new FlickDetector();
  let fires = 0; const powers: number[] = [];
  sig.forEach((s, i) => { const d = det.feed(s, i * 33); if (d.fire) { fires += 1; powers.push(+d.power.toFixed(2)); } });
  return { fires, powers };
}

// One physical flick: ready → snap → recover → settle (the settle used to double-fire).
function flick(depth: number): number[] {
  return [
    0.42, 0.42, 0.42, 0.42, 0.42, // ready
    0.42 - depth * 0.5, 0.42 - depth, // snap down (2 frames)
    0.42 - depth, 0.42 - depth, // held low
    0.15, 0.32, 0.45, // recovery (overshoot back up)
    0.42, 0.39, 0.36, 0.33, // settle back down (the spurious-fire trap)
    0.42, 0.42, 0.42, // ready again
  ];
}

{
  const r = run(flick(0.40));
  check('one flick fires exactly once (no double-fire)', r.fires === 1, `fires=${r.fires} powers=${JSON.stringify(r.powers)}`);
  check('flick power is makeable', r.powers[0] > 0.75 && r.powers[0] < 1.25, `power=${r.powers[0]}`);
}
{
  const r = run([...flick(0.40), ...flick(0.40)]);
  check('two flicks fire twice', r.fires === 2, `fires=${r.fires}`);
}
{ // raising the whole arm → fingertip-above-wrist stays constant → no fire
  const r = run(Array(24).fill(0.40));
  check('steady hand / arm-raise does not fire', r.fires === 0, `fires=${r.fires}`);
}
{ // rest jitter
  const r = run(Array.from({ length: 24 }, (_, i) => 0.40 + (i % 2 ? 0.03 : -0.03)));
  check('rest jitter does not fire', r.fires === 0, `fires=${r.fires}`);
}
{ // discrimination: bigger snap → more power
  const small = run(flick(0.25)).powers[0] ?? 0;
  const big = run(flick(0.52)).powers[0] ?? 0;
  check('discrimination: bigger flick → more power', big > small + 0.2, `small=${small} big=${big}`);
}
{ // clamp
  const r = run(flick(0.85));
  check('very hard flick clamps ≤1.6', (r.powers[0] ?? 0) <= 1.6, `power=${r.powers[0]}`);
}

console.log(`\n${pass} passed, ${fail} failed  (MIN_DROP=${MIN_DROP})`);
console.log(`  feel: small(0.25)→${run(flick(0.25)).powers[0]}  normal(0.40)→${run(flick(0.40)).powers[0]}  hard(0.52)→${run(flick(0.52)).powers[0]}  (green=1.0)`);
process.exit(fail ? 1 : 0);
