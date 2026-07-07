// Hero screenshots of the real game: start screen + several gameplay moments
// after the 3D models have loaded. Usage: node scripts/hero.mjs [--mobile]
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { cdpShot } from './cdpshot.mjs';

const mobile = process.argv.includes('--mobile');
const base = process.env.BASE || 'http://127.0.0.1:5188';
const dir = `artifacts/hero/${mobile ? 'mobile' : 'desktop'}`;
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext(mobile ? devices['iPhone 13'] : { viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
await cdpShot(page, `${dir}/00-start.png`);

// Start a game with a full line of opponents.
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('#pick-count .pick-btn')];
  const most = btns[btns.length - 1];
  most?.click();
});
await page.click('#btn-start');
await page.waitForTimeout(3500);
await cdpShot(page, `${dir}/01-line.png`);
await page.waitForTimeout(2500);
await cdpShot(page, `${dir}/02-play.png`);
await page.waitForTimeout(2500);
await cdpShot(page, `${dir}/03-play.png`);
console.log(`[${mobile ? 'mobile' : 'desktop'}] errors:`, errs.slice(0, 4));
await browser.close();
console.log(`wrote to ${dir}`);
