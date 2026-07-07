// Capture live gameplay moments: a shot in flight, the result, and the end
// screen — with the real 3D assets. Usage: node scripts/play.mjs [--mobile]
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { cdpShot } from './cdpshot.mjs';

const mobile = process.argv.includes('--mobile');
const base = process.env.BASE || 'http://127.0.0.1:5188';
const dir = `artifacts/play/${mobile ? 'mobile' : 'desktop'}`;
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext(mobile ? devices['iPhone 13'] : { viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
const state = () => page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.state?.() ?? null);

await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
// Click START and confirm the game actually began (state != null).
for (let i = 0; i < 10; i += 1) {
  await page.evaluate(() => (document.getElementById('btn-start'))?.click());
  await page.waitForTimeout(600);
  if (await state()) break;
}
await page.waitForTimeout(2500); // let models load + line form
console.log('started:', JSON.stringify(await state()));

// Deterministic QA shoot at an exact power once it's our turn.
async function shoot(power) {
  for (let i = 0; i < 20; i += 1) {
    const s = await state();
    if (s?.userPhase === 'aiming' || s?.userPhase === 'putback') break;
    await page.waitForTimeout(350);
  }
  await page.evaluate((p) => window.__THREE_GAME_TEST_HOOKS__.shoot(p), power);
}

await shoot(1.0); // dead-center make
await page.waitForTimeout(180);
await cdpShot(page, `${dir}/10-flight-early.png`);
await page.waitForTimeout(320);
await cdpShot(page, `${dir}/11-flight-near-rim.png`);
await page.waitForTimeout(500);
await cdpShot(page, `${dir}/12-result.png`);
console.log('after make:', JSON.stringify(await state()));

// Capture a miss too (overpowered), then play out to the end.
await shoot(1.55);
await page.waitForTimeout(900);
await cdpShot(page, `${dir}/13-miss.png`);

for (let round = 0; round < 20; round += 1) {
  const s = await state();
  if (s?.over) break;
  if (s?.userPhase === 'aiming' || s?.userPhase === 'putback') {
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__.shoot(1.0)); // makes → progress
  }
  await page.waitForTimeout(1300);
  if (round === 4) await cdpShot(page, `${dir}/14-midgame.png`);
}
await page.waitForTimeout(600);
await cdpShot(page, `${dir}/15-endscreen.png`);
console.log('final:', JSON.stringify(await state()));
console.log('errors:', errs.slice(0, 4));
await browser.close();
console.log(`wrote to ${dir}`);
