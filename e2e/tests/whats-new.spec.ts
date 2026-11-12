import { test, expect, type APIResponse } from '@playwright/test';

/**
 * FEAT-115 (#990): the administrators' What's New? window, against the real
 * stack: the release notes ship in the API image, the seen state lives in the
 * new User columns, and on a fresh install the first administrator (the suite
 * user, created by the sign-up of global-setup) has everything installed seen,
 * so the window does not open by itself; the sidebar link reopens it.
 */

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

const WHATS_NEW = /What's New\?|Quoi de neuf/;

type View = { currentVersion: string; releases: Array<{ version: string | null; notes: Array<{ id: string; seen: boolean; text: { en: string; fr: string } }> }> };

test('the release notes ship with the image, at the installed version, all seen on a new install', async ({ page }) => {
  const me = await okData<{ isAdmin: boolean }>(await page.request.get('/api/user/me'));
  test.skip(!me.isAdmin, 'needs the suite user to be the instance admin (fresh database)');

  const { version } = await okData<{ version: string }>(await page.request.get('/api/version'));
  const view = await okData<View>(await page.request.get('/api/admin/release-notes'));
  expect(view.currentVersion).toBe(version);
  // api/release-notes/ is in the image: there is at least one note, in both languages.
  const notes = view.releases.flatMap((r) => r.notes);
  expect(notes.length).toBeGreaterThan(0);
  expect(notes.every((n) => n.text.en.length > 0 && n.text.fr.length > 0)).toBe(true);
  expect(notes.every((n) => n.seen)).toBe(true);

  // Closing the window again keeps it that way.
  expect((await page.request.post('/api/admin/release-notes/seen')).status()).toBe(204);
  const after = await okData<View>(await page.request.get('/api/admin/release-notes'));
  expect(after.releases.flatMap((r) => r.notes).every((n) => n.seen)).toBe(true);
});

test('no window by itself on a new install; the sidebar link reopens it, Escape closes it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the sidebar link; phones reach it from Administration');
  const me = await okData<{ isAdmin: boolean }>(await page.request.get('/api/user/me'));
  test.skip(!me.isAdmin, 'needs the suite user to be the instance admin (fresh database)');
  const { version } = await okData<{ version: string }>(await page.request.get('/api/version'));

  const notesRead = page.waitForResponse((r) => r.url().includes('/api/admin/release-notes') && r.request().method() === 'GET');
  await page.goto('/cellars');
  await notesRead;
  // The version beside the link appears with the notes' answer.
  const sidebar = page.getByRole('navigation').filter({ has: page.getByRole('button', { name: WHATS_NEW }) });
  await expect(sidebar.getByText(version, { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await sidebar.getByRole('button', { name: WHATS_NEW }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { level: 2, name: WHATS_NEW })).toBeVisible();
  await expect(dialog).toContainText(version);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
