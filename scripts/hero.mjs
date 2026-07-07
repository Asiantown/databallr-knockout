// Hero screenshots of the real game: start screen + several gameplay moments
// after the 3D models have loaded. Usage: node scripts/hero.mjs [--mobile]
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';

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
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.screenshot({ path: `${dir}/00-start.png` });

// Start a game with more opponents for a fuller line.
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('#pick-count .pick-btn')];
  const five = btns.find((b) => b.textContent.trim().startsWith('5')) || btns[btns.length - 1];
  five?.click();
});
await page.click('#btn-start');
// Wait for models to load and figures to settle.
await page.waitForTimeout(3500);
await page.screenshot({ path: `${dir}/01-line.png` });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${dir}/02-play.png` });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${dir}/03-play.png` });
console.log(`[${mobile ? 'mobile' : 'desktop'}] errors:`, errs.slice(0, 4));
await browser.close();
console.log(`wrote to ${dir}`);
