// Screenshot a GLB from a few angles via the model-lab page. Dev-only.
// Usage: node scripts/assetgen/snap-model.mjs player_a
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const name = process.argv[2] || 'player_a';
const base = process.env.BASE || 'http://127.0.0.1:5188';
const outDir = 'artifacts/models';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 500, height: 640 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`${base}/model-lab.html?m=${name}`, { waitUntil: 'networkidle' });
try {
  await page.waitForFunction(() => window.__LOADED__ === true || window.__ERROR__, { timeout: 30000 });
} catch { /* fallthrough to report */ }
const info = await page.evaluate(() => ({ info: window.__INFO__, error: window.__ERROR__ }));
console.log(`[${name}]`, JSON.stringify(info));
if (info.error) { await browser.close(); process.exit(1); }
const angles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
for (let i = 0; i < angles.length; i += 1) {
  await page.evaluate((a) => window.__SPIN__(a), angles[i]);
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${outDir}/${name}-${i}.png` });
}
if (errs.length) console.log(`[${name}] console errors:`, errs.slice(0, 3));
await browser.close();
console.log(`[${name}] wrote ${angles.length} angles to ${outDir}`);
