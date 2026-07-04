import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:5188');
await page.locator('#btn-start').click();
await page.waitForTimeout(700);
await page.screenshot({ path: 'artifacts/user-run/desktop/snap-live.png' });
await browser.close();
