import { test, expect } from '@playwright/test';
import { creds } from './_helpers';

// ISSUE_020 ("no restore has ever been proven"): a real backup/restore
// round-trip against the actual running stack, not a mock. The E2E user is
// the first account registered on the fresh E2E database (tmpfs Postgres,
// see docker-compose.e2e.yml) and therefore the instance admin — the only
// role allowed to call these endpoints.
//
// Safety: `fullyParallel: false` / `workers: 1` (playwright.config.ts) means
// no other spec runs concurrently, so the backup taken here captures
// whatever earlier specs already created and cleaned up — restoring to it
// only erases what THIS test creates after taking it, never another spec's
// already-finished assertions or the shared fixtures global-setup seeded.
test('a manual backup can actually restore the database it was taken from', async ({ page }) => {
  const backupRes = await page.request.post('/api/admin/backups/run');
  expect(backupRes.ok()).toBe(true);
  const run = (await backupRes.json())?.data;
  expect(run?.id).toBeTruthy();
  expect(run?.success).toBe(true);

  // Create something that exists only AFTER the backup was taken.
  const marker = `E2E Restore Marker ${Date.now()}`;
  const createRes = await page.request.post('/api/inventory', {
    data: { category: 'wine', name: marker, producer: 'E2E Domaine' },
  });
  expect(createRes.ok()).toBe(true);

  const beforeRestore = await page.request.get('/api/inventory');
  const itemsBefore = (await beforeRestore.json())?.data ?? [];
  expect(itemsBefore.some((i: { name: string }) => i.name === marker)).toBe(true);

  // #489: restore re-asks the admin's password.
  const wrongPassword = await page.request.post(`/api/admin/backups/${run.id}/restore`, {
    data: { confirm: true, password: 'not-the-password' },
  });
  expect(wrongPassword.status()).toBe(403);

  const restoreRes = await page.request.post(`/api/admin/backups/${run.id}/restore`, {
    data: { confirm: true, password: creds().password },
  });
  expect(restoreRes.ok()).toBe(true);
  expect((await restoreRes.json())?.data?.ok).toBe(true);

  // The marker created after the backup must be gone; it never existed in
  // the dump that was just restored.
  const afterRestore = await page.request.get('/api/inventory');
  expect(afterRestore.ok()).toBe(true);
  const itemsAfter = (await afterRestore.json())?.data ?? [];
  expect(itemsAfter.some((i: { name: string }) => i.name === marker)).toBe(false);
});
