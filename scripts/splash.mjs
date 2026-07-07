// Densely capture the make celebration around ball-arrival. node scripts/splash.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { cdpShot } from './cdpshot.mjs';

const base = 'http://127.0.0.1:5188';
const dir = 'artifacts/splash';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const state = () => page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.state?.() ?? null);
await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
for (let i = 0; i < 10; i += 1) { await page.evaluate(() => document.getElementById('btn-start')?.click()); await page.waitForTimeout(500); if (await state()) break; }
await page.waitForTimeout(2500);
// wait for our turn, then shoot dead-center
for (let i = 0; i < 20; i += 1) { const s = await state(); if (s?.userPhase === 'aiming') break; await page.waitForTimeout(350); }
await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__.shoot(1.0));
// Burst-capture through the whole flight so we definitely catch the arrival splash.
for (let i = 0; i < 16; i += 1) { await page.waitForTimeout(110); await cdpShot(page, `${dir}/b${String(i).padStart(2, '0')}.png`); }
console.log('done', JSON.stringify(await state()));
await browser.close();
