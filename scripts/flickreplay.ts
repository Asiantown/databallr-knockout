// Fast calibration loop: replay the cached real-flick landmarks
// (artifacts/flickframes.json, from scripts/flickframes.ts) through the shared
// detector — no browser. Tweak src/flick.ts constants and re-run instantly.
// Run: node --experimental-strip-types scripts/flickreplay.ts
import { readFileSync } from 'node:fs';
import { FlickDetector, MIN_DROP, POWER_CAL, COOLDOWN_MS } from '../src/flick.ts';

const frames: Array<{ t: number; has: number; sig?: number }> = JSON.parse(readFileSync('artifacts/flickframes.json', 'utf8'));
const det = new FlickDetector();
const fires: Array<{ t: number; drop: number; pow: number }> = [];
for (const f of frames) {
  if (!f.has) continue;
  const d = det.feed(f.sig!, f.t);
  if (d.fire) fires.push({ t: f.t, drop: +d.drop.toFixed(3), pow: +d.power.toFixed(2) });
}
console.log(`tuning: MIN_DROP=${MIN_DROP}  POWER_CAL=${POWER_CAL}  COOLDOWN=${COOLDOWN_MS}  (a make ≈ drop ${(1 / POWER_CAL).toFixed(2)})`);
console.log(`FIRES: ${fires.length}  (the clip has ~5 physical flicks → expect ~5)`);
fires.forEach((x, i) => console.log(`  flick ${i + 1}: t=${(x.t / 1000).toFixed(1)}s  drop=${x.drop}  power=${x.pow}`));
const pows = fires.map((f) => f.pow);
if (pows.length) console.log(`power range: ${Math.min(...pows)} .. ${Math.max(...pows)}  (green = 1.0; makes when ~0.7-1.3 for Curry)`);
