import { test, expect } from '@playwright/test';

// Collections are per-user (userId-scoped) — safe to create/delete without
// touching the shared inventory.
test('create a collection through the form, see it in the list, then delete it', async ({ page }) => {
  const name = `E2E ${Date.now()}`;

  await page.goto('/collections');

  const created = page.waitForResponse(
    (r) => r.url().match(/\/api\/collections\/?$/) !== null && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Nouvelle collection' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').first().fill(name);
  await dialog.getByRole('button', { name: /Créer|Enregistrer|Ajouter/ }).click();

  const res = await created;
  expect(res.ok()).toBe(true);
  const id = (await res.json())?.data?.id as string;
  expect(id).toBeTruthy();

  await expect(dialog).toBeHidden();
  await expect(page.getByText(name, { exact: true })).toBeVisible();

  const del = await page.request.delete(`/api/collections/${id}`);
  expect(del.ok()).toBe(true);
  await page.reload();
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
});
