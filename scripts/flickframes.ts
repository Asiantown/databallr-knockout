// Calibrate the flick against a recorded clip at FULL frame rate. Loads
// flickcal.html (which seeks MediaPipe over every frame, immune to headless
// inference slowness), then replays the dense signal through the real
// decideFlick — reporting what would fire, at what power, plus the peak-speed
// distribution so the mapping can be tuned to the actual gesture.
//
// Run: node --experimental-strip-types scripts/flickframes.ts [/_flickcal.mp4]
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { FlickDetector, MIN_DROP, POWER_CAL } from '../src/flick.ts';

const base = process.env.BASE || 'http://127.0.0.1:5188';
const videoUrl = process.argv[2] || '/_flickcal.mp4';

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const errs: string[] = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
page.on('pageerror', (e) => errs.push('PAGEERR ' + String(e).slice(0, 160)));
await page.goto(`${base}/flickcal.html?v=${encodeURIComponent(videoUrl)}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => (window as any).__READY__ === true, { timeout: 40000 });
const frames: Array<{ t: number; has: number; sig?: number }> = await page.evaluate(() => (window as any).__PROCESS_ALL__(30));
await browser.close();

const hand = frames.filter((f) => f.has);
console.log(`frames: ${frames.length}, with hand: ${hand.length} (${Math.round((hand.length / frames.length) * 100)}%)`);
if (errs.length) console.log('errors:', JSON.stringify(errs.slice(0, 4)));
if (!hand.length) { console.log('no hand detected'); process.exit(0); }

const sigs = hand.map((f) => f.sig!) as number[];
console.log(`signal (fingertip-above-wrist): ${Math.min(...sigs).toFixed(3)} .. ${Math.max(...sigs).toFixed(3)}`);

// Replay through the SAME detector the game uses.
const det = new FlickDetector();
const fires: Array<{ t: number; drop: number; pow: number }> = [];
const trace: Array<{ t: number; drop: number }> = [];
for (const f of frames) {
  if (!f.has) continue;
  const d = det.feed(f.sig!, f.t);
  trace.push({ t: f.t, drop: +d.drop.toFixed(3) });
  if (d.fire) fires.push({ t: f.t, drop: +d.drop.toFixed(3), pow: +d.power.toFixed(2) });
}

console.log(`(tuning: MIN_DROP=${MIN_DROP}, POWER_CAL=${POWER_CAL} → a make ≈ drop ${(1 / POWER_CAL).toFixed(2)})`);
console.log(`\nFIRES: ${fires.length}  (expect ~1 per physical flick)`);
fires.forEach((x, i) => console.log(`  flick ${i + 1}: t=${(x.t / 1000).toFixed(1)}s  drop=${x.drop}  power=${x.pow}`));
const pows = fires.map((f) => f.pow);
if (pows.length) console.log(`  power range: ${Math.min(...pows)} .. ${Math.max(...pows)}  (green = 1.0)`);

writeFileSync('artifacts/flickframes.json', JSON.stringify(frames));
console.log('\nfull frame track → artifacts/flickframes.json');
