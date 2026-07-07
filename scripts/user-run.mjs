// Scripted "play it like a human" pass: drives the real UI, screenshots each
// stage, and reports console/page errors + observed state. Usage:
//   node scripts/user-run.mjs [--url http://127.0.0.1:5188] [--mobile]
import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
import { cdpShot } from './cdpshot.mjs';

const url = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://127.0.0.1:5188';
const mobile = process.argv.includes('--mobile');
const outDir = `artifacts/user-run/${mobile ? 'mobile' : 'desktop'}`;
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext(
  mobile ? { ...devices['iPhone 13'] } : { viewport: { width: 1280, height: 720 } },
);
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e)));

const shot = async (name) => cdpShot(page, `${outDir}/${name}.png`);
const state = async () => page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.state?.() ?? null);

await page.goto(url);
await page.waitForTimeout(800);
await shot('01-start-overlay');

// Pick 2 opponents for fast cycles, start.
const countBtns = page.locator('#pick-count .pick-btn');
await countBtns.first().click();
await page.locator('#btn-start').click();
await page.waitForTimeout(600);
await shot('02-game-live');
console.log('state after start:', JSON.stringify(await state()));

const vp = mobile ? devices['iPhone 13'].viewport : { width: 1280, height: 720 };
const cx = vp.width / 2;

// 1) Weak, slow drag — what feedback does a user get?
await page.mouse.move(cx, vp.height * 0.7);
await page.mouse.down();
for (let i = 0; i < 10; i += 1) {
  await page.mouse.move(cx, vp.height * (0.7 - i * 0.01));
  await page.waitForTimeout(40);
}
await page.mouse.up();
await page.waitForTimeout(700);
await shot('03-after-weak-drag');
console.log('state after weak drag:', JSON.stringify(await state()));

// 2) Sharp drag flick. On mobile emulation Playwright's mouse doesn't map to
// touch, so dispatch a real touch-pointer sequence (what actual devices send).
if (mobile) {
  await page.evaluate(({ x, h }) => {
    const opts = (y) => ({ bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y });
    const target = document.getElementById('game-canvas');
    let y = h * 0.8;
    target.dispatchEvent(new PointerEvent('pointerdown', opts(y)));
    return new Promise((resolve) => {
      let i = 0;
      const step = () => {
        i += 1; y = h * (0.8 - i * 0.07);
        target.dispatchEvent(new PointerEvent('pointermove', opts(y)));
        if (i < 5) setTimeout(step, 12);
        else { target.dispatchEvent(new PointerEvent('pointerup', opts(y))); resolve(null); }
      };
      setTimeout(step, 12);
    });
  }, { x: cx, h: vp.height });
} else {
  await page.mouse.move(cx, vp.height * 0.8);
  await page.mouse.down();
  for (let i = 1; i <= 5; i += 1) {
    await page.mouse.move(cx, vp.height * (0.8 - i * 0.07));
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
}
await page.waitForTimeout(1400);
await shot('04-shot-in-flight-or-result');
console.log('state after sharp flick:', JSON.stringify(await state()));
await page.waitForTimeout(2500);
await shot('05-after-shot-settles');

// 3) Trackpad two-finger swipe = wheel burst.
for (let i = 0; i < 6; i += 1) {
  await page.mouse.wheel(0, -140);
  await page.waitForTimeout(16);
}
await page.waitForTimeout(1500);
await shot('06-after-wheel-swipe');
console.log('state after wheel swipe:', JSON.stringify(await state()));

// 4) Keyboard: hold Space, release.
await page.keyboard.down(' ');
await page.waitForTimeout(650);
await page.keyboard.up(' ');
await page.waitForTimeout(1500);
await shot('07-after-space-charge');
console.log('state after space charge:', JSON.stringify(await state()));

// 5) Let the knockout race run; keep flicking whenever it's our turn.
for (let round = 0; round < 14; round += 1) {
  const s = await state();
  if (s?.over) break;
  if (s?.userPhase === 'aiming' || s?.userPhase === 'putback') {
    await page.mouse.move(cx, vp.height * 0.85);
    await page.mouse.down();
    const steps = 4 + Math.floor(Math.random() * 4);
    for (let i = 1; i <= steps; i += 1) {
      await page.mouse.move(cx, vp.height * (0.85 - i * 0.08));
      await page.waitForTimeout(11);
    }
    await page.mouse.up();
  }
  await page.waitForTimeout(1600);
}
await shot('08-late-game');
console.log('late-game state:', JSON.stringify(await state()));

console.log('consoleErrors:', JSON.stringify(consoleErrors));
console.log('pageErrors:', JSON.stringify(pageErrors));
await browser.close();
