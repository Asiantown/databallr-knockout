// Focused input probe: is the pointer drag path firing? Logs target elements,
// event flow, and hook state.
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', String(e)));

await page.goto('http://127.0.0.1:5188');
await page.locator('#pick-count .pick-btn').first().click();
await page.locator('#btn-start').click();
await page.waitForTimeout(400);

// Instrument: log what the window-level listeners see.
await page.evaluate(() => {
  ['pointerdown', 'pointermove', 'pointerup'].forEach((type) => {
    window.addEventListener(type, (e) => {
      const pe = e;
      if (type !== 'pointermove' || Math.random() < 0.34) {
        console.log(`evt ${type} y=${Math.round(pe.clientY)} target=${e.target?.id || e.target?.tagName} t=${Math.round(performance.now())}`);
      }
    }, { capture: true });
  });
});

console.log('state:', JSON.stringify(await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__.state())));

const cx = 640;
await page.mouse.move(cx, 600);
await page.mouse.down();
for (let i = 1; i <= 5; i += 1) {
  await page.mouse.move(cx, 600 - i * 55);
  await page.waitForTimeout(12);
}
await page.mouse.up();
await page.waitForTimeout(300);
console.log('after drag:', JSON.stringify(await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__.state())));
await browser.close();
