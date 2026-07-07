// Screenshot helper that uses the CDP Page.captureScreenshot command instead of
// Playwright's page.screenshot(). The latter waits on document.fonts.ready and
// hangs on our continuously-rendering WebGL/bloom page even though fonts are
// loaded; CDP capture takes the frame directly.
import { writeFileSync } from 'node:fs';

export async function cdpShot(page, path) {
  const client = await page.context().newCDPSession(page);
  const { data } = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path, Buffer.from(data, 'base64'));
  await client.detach().catch(() => {});
}
