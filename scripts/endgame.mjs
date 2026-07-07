// Play a 3-player game to completion (user makes every turn; weaker AIs miss and
// get knocked out) and capture the game-over screen. node scripts/endgame.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { cdpShot } from './cdpshot.mjs';

const base = 'http://127.0.0.1:5188';
const dir = 'artifacts/endgame';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
const state = () => page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.state?.() ?? null);

await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
// pick 2 opponents (first pick-count button) then start
await page.evaluate(() => document.querySelectorAll('#pick-count .pick-btn')[0]?.click());
for (let i = 0; i < 10; i += 1) { await page.evaluate(() => document.getElementById('btn-start')?.click()); await page.waitForTimeout(500); if (await state()) break; }
await page.waitForTimeout(2500);

// Make every attempt with tight polling; verify the game actually reaches a
// winner (the final 1v1 must resolve, not loop forever).
for (let round = 0; round < 140; round += 1) {
  const s = await state();
  if (s?.over) break;
  if (s?.userPhase === 'aiming' || s?.userPhase === 'putback') {
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__.shoot(1.0));
  }
  await page.waitForTimeout(250);
}
await page.waitForTimeout(900);
await cdpShot(page, `${dir}/gameover.png`);
console.log('final:', JSON.stringify(await state()));
console.log('errors:', errs.slice(0, 4));
await browser.close();
