import { test, expect, type Locator } from '@playwright/test';
import { creds } from './_helpers';

/**
 * #668: an uploaded profile photo was saved as
 * `http://localhost:3001/uploads/avatars/…`. The E2E stack publishes port
 * 3001 on the host, so that address happened to load here, while a
 * production stack (3001 not published, often behind HTTPS) showed a broken
 * image everywhere. The photo must be saved as a relative path, served
 * through the web app's own `/uploads` rewrite, and actually load in the
 * profile, the sidebar and the lock screen.
 */

// An 8x8 opaque PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4oOCAFTEMLQkAQmxIARA0p54AAAAASUVORK5CYII=',
  'base64',
);

/** Every image matched has been fetched and decoded (a broken one has naturalWidth 0). */
async function expectLoaded(images: Locator) {
  await expect(images.first()).toBeVisible();
  await expect
    .poll(() => images.evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)))
    .not.toContain(false);
}

test.afterEach(async ({ page }) => {
  // The suite shares one account: leave it without a photo, as it started.
  await page.request.delete('/api/user/avatar').catch(() => {});
});

test('an uploaded avatar is saved relative and shows in the profile, the sidebar and the lock screen', async ({ page }) => {
  await page.goto('/profile');

  const uploaded = page.waitForResponse((res) => res.url().endsWith('/api/user/avatar') && res.request().method() === 'POST');
  await page.locator('input[type="file"][accept^="image/"]').first().setInputFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  const response = await uploaded;
  expect(response.ok(), await response.text()).toBe(true);

  const { data } = (await response.json()) as { data: { avatarUrl: string | null } };
  expect(data.avatarUrl).toMatch(/^\/uploads\/avatars\/[0-9a-f-]+\.(png|webp)$/);
  const avatarUrl = data.avatarUrl as string;

  // The profile photo and the sidebar avatar: same address, both loaded,
  // from the web app's own origin.
  const images = page.locator(`img[src="${avatarUrl}"]`);
  await expectLoaded(images);
  expect(await images.count()).toBeGreaterThanOrEqual(2);
  const origin = new URL(page.url()).origin;
  for (const src of await images.evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).currentSrc))) {
    expect(new URL(src).origin).toBe(origin);
  }

  // Still there after a reload: read back from the server, not the upload answer.
  await page.reload();
  await expectLoaded(page.locator(`img[src="${avatarUrl}"]`));

  // The lock screen.
  await page.getByRole('button', { name: 'Verrouiller', exact: true }).click();
  const lock = page.getByRole('dialog', { name: 'Application verrouillée' });
  await expect(lock).toBeVisible();
  await expectLoaded(lock.locator(`img[src="${avatarUrl}"]`));
  await lock.locator('input[type="password"]').fill(creds().password);
  await lock.getByRole('button', { name: 'Déverrouiller', exact: true }).click();
  await expect(lock).toBeHidden();
});
