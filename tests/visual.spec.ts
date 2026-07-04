// Visual + smoke verification for databallr KNOCKOUT (adapted from the jam
// repo's harness): canvas renders non-blank pixels, no console/page errors,
// and the start flow reaches an active game with a live HUD.
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

type CanvasSample = {
  ok: boolean;
  reason: string;
  variance?: number;
  colorBuckets?: number;
};

async function sampleCanvas(page: import('@playwright/test').Page): Promise<CanvasSample> {
  const canvas = page.locator('#game-canvas');
  const box = await canvas.boundingBox();
  if (!box || box.width < 32 || box.height < 32) {
    return { ok: false, reason: 'canvas-too-small' };
  }

  const buffer = await canvas.screenshot();
  const png = PNG.sync.read(buffer);
  let min = 255;
  let max = 0;
  const buckets = new Set<string>();
  const stride = Math.max(1, Math.floor((png.width * png.height) / 4096));

  for (let pixel = 0; pixel < png.width * png.height; pixel += stride) {
    const offset = pixel * 4;
    const r = png.data[offset];
    const g = png.data[offset + 1];
    const b = png.data[offset + 2];
    const luma = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    min = Math.min(min, luma);
    max = Math.max(max, luma);
    buckets.add(`${r >> 5}-${g >> 5}-${b >> 5}`);
  }

  const variance = max - min;
  if (variance < 8) return { ok: false, reason: 'canvas-flat', variance };
  if (buckets.size < 3) return { ok: false, reason: 'too-few-colors', colorBuckets: buckets.size };
  return { ok: true, reason: 'ok', variance, colorBuckets: buckets.size };
}

test('renders, starts a game, and shows a live knockout HUD', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto('/');
  await expect(page.locator('#overlay-card h1')).toContainText('KNOCKOUT');

  // Scene renders behind the start overlay — canvas must not be blank.
  const preStart = await sampleCanvas(page);
  expect(preStart.ok, `pre-start canvas: ${preStart.reason}`).toBe(true);

  await page.locator('#btn-start').click();
  await expect(page.locator('#overlay')).toBeHidden();

  // Live game: alive counter + the line of real shooters render.
  await expect(page.locator('#hud-alive')).toContainText('alive');
  await expect(page.locator('.line-row')).toHaveCount(5); // you + 4 default opponents
  await expect(page.locator('.line-row.you')).toHaveCount(1);

  // A flick (synthetic upward pointer drag) launches without errors.
  const viewport = page.viewportSize()!;
  const cx = viewport.width / 2;
  await page.mouse.move(cx, viewport.height * 0.8);
  await page.mouse.down();
  for (let step = 1; step <= 6; step += 1) {
    await page.mouse.move(cx, viewport.height * (0.8 - step * 0.09));
  }
  await page.mouse.up();

  await page.waitForTimeout(2200);
  const inFlight = await sampleCanvas(page);
  expect(inFlight.ok, `post-flick canvas: ${inFlight.reason}`).toBe(true);

  expect(consoleErrors, consoleErrors.join('\n')).toHaveLength(0);
  expect(pageErrors, pageErrors.join('\n')).toHaveLength(0);
});
