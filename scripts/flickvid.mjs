// Replay a recorded flick through the game's REAL camera pipeline: Chromium uses
// the video file as a fake webcam, MediaPipe tracks it, and we dump the exact
// per-frame signal / speed / fire log for offline calibration.
//
// Usage: node scripts/flickvid.mjs <clip.y4m> [seconds]
//   (convert first: ffmpeg -i clip.mov -pix_fmt yuv420p -s 640x480 -r 30 clip.y4m)
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const y4m = resolve(process.argv[2] || '');
const seconds = Number(process.argv[3] || 14);
const base = process.env.BASE || 'http://127.0.0.1:5188';
if (!process.argv[2]) { console.error('need a .y4m path'); process.exit(1); }

const browser = await chromium.launch({
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-video-capture=${y4m}`,
  ],
});
const ctx = await browser.newContext({ permissions: ['camera'] });
const page = await ctx.newPage();
await page.addInitScript(() => { window.__FLICK_DEBUG__ = true; window.__FLICK_LOG__ = []; });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
page.on('pageerror', (e) => errs.push('PAGEERR ' + String(e).slice(0, 140)));

await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
await page.evaluate(() => document.getElementById('btn-cam').click());
// wait for MediaPipe to load
for (let i = 0; i < 30; i += 1) { await page.waitForTimeout(1000); if (await page.evaluate(() => window.__HAND_INPUT__?.active)) break; }
await page.evaluate(() => { window.__FLICK_LOG__ = []; }); // clear startup
await page.waitForTimeout(seconds * 1000);

const log = await page.evaluate(() => window.__FLICK_LOG__ || []);
await browser.close();

// --- summary ---------------------------------------------------------------
const withHand = log.length;
if (!withHand) {
  console.log('frames with hand: 0 — MediaPipe found no hand in the clip.');
  if (errs.length) console.log('errors:', JSON.stringify(errs.slice(0, 4)));
  console.log('(plumbing OK if this ran cleanly; a real hand clip will populate it.)');
  process.exit(0);
}
const sigs = log.map((r) => r.sig);
const spds = log.map((r) => r.spd);
const fires = log.filter((r) => r.fire);
const q = (arr, p) => arr.length ? [...arr].sort((a, b) => a - b)[Math.floor(p * (arr.length - 1))] : 0;
console.log(`frames with hand: ${withHand}`);
console.log(`signal (fingertip-above-wrist): min ${Math.min(...sigs).toFixed(3)}  max ${Math.max(...sigs).toFixed(3)}  (range = flick depth)`);
console.log(`peak-speed seen: median ${q(spds, 0.5).toFixed(2)}  p90 ${q(spds, 0.9).toFixed(2)}  max ${Math.max(...spds).toFixed(2)}`);
console.log(`FIRES: ${fires.length}`);
fires.forEach((f, i) => console.log(`  fire ${i + 1}: t=${f.t} speed=${f.spd} power=${f.pow}`));
if (errs.length) console.log('errors:', JSON.stringify(errs.slice(0, 4)));
writeFileSync('artifacts/flicklog.json', JSON.stringify(log));
console.log('full per-frame log → artifacts/flicklog.json');
