// Visual + smoke verification for databallr KNOCKOUT.
//
// The scene renders on a continuously-animating WebGL canvas with a bloom pass.
// Playwright's screenshot / boundingBox actionability waits (it blocks on
// document.fonts.ready and frame stability) HANG on such a canvas, and CDP
// capture only exists in Chromium — so instead of sampling pixels we read the
// renderer's own counters (draw calls, triangles, a monotonic frame counter)
// through the diagnostics hook. If those advance with non-zero geometry, the
// scene is genuinely drawing. This is engine-agnostic and can't hang.
import { expect, test } from '@playwright/test';

type Diag = { drawCalls: number; geometries: number; frames: number };

async function readDiag(page: import('@playwright/test').Page): Promise<Diag> {
  return page.evaluate(() => {
    const d = window.__THREE_GAME_DIAGNOSTICS__;
    return { drawCalls: d?.drawCalls() ?? 0, geometries: d?.geometries() ?? 0, frames: d?.frames() ?? 0 };
  });
}

test('renders, starts a game, and shows a live knockout HUD', async ({ page }) => {
  // Headless software-WebGL renders the bloom pipeline slowly, so give the flow
  // room beyond the 30s default.
  test.setTimeout(90_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto('/');
  await expect(page.locator('#overlay-card h1')).toContainText('KNOCKOUT');

  // Scene renders behind the start overlay — the loop must be running and
  // drawing real geometry (not a blank clear).
  const before = await readDiag(page);
  await page.waitForTimeout(600);
  const after = await readDiag(page);
  expect(after.frames, 'render loop should advance').toBeGreaterThan(before.frames);
  expect(after.drawCalls, 'scene should issue draw calls').toBeGreaterThan(0);
  expect(after.geometries, 'court geometry should be resident').toBeGreaterThan(8);

  // Click via in-page JS: Playwright's input actionability (visible/stable/hit-
  // test) starves on the continuously-repainting canvas in headless software GL.
  await page.evaluate(() => (document.getElementById('btn-start') as HTMLButtonElement).click());
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

  // Scene keeps rendering with the 3D ballers + ball in play.
  const mid = await readDiag(page);
  await page.waitForTimeout(1200);
  const late = await readDiag(page);
  expect(late.frames, 'loop keeps running mid-game').toBeGreaterThan(mid.frames);
  expect(late.geometries, 'characters/ball add geometry').toBeGreaterThan(8);

  expect(consoleErrors, consoleErrors.join('\n')).toHaveLength(0);
  expect(pageErrors, pageErrors.join('\n')).toHaveLength(0);
});
