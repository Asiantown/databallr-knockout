import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:5188');
await page.locator('#btn-start').click();
for (const [name, wait] of [['a-1s', 1000], ['b-2.5s', 1500], ['c-4s', 1500], ['d-6s', 2000], ['e-9s', 3000]]) {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `artifacts/user-run/desktop/live-${name}.png` });
}
await browser.close();
