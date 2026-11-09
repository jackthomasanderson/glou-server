import { test, expect } from '@playwright/test';

// Collections are per-user (userId-scoped) — safe to create/delete without
// touching the shared inventory.
test('create a collection through the form, see it in the list, then delete it', async ({ page }) => {
  const name = `E2E ${Date.now()}`;

  await page.goto('/collections');

  const created = page.waitForResponse(
    (r) => r.url().match(/\/api\/collections\/?$/) !== null && r.request().method() === 'POST',
  );
  await page.getByTestId('collection-create-button').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').first().fill(name);
  await dialog.getByTestId('collection-form-submit').click();

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

// #708: an empty collection said "no result for these filters", whose reset
// dropped the collection; it now says it is empty and leads back to the list.
test('an empty collection says so and leads back to the collections', async ({ page }) => {
  const created = await page.request.post('/api/collections', { data: { name: `E2E empty ${Date.now()}` } });
  expect(created.ok()).toBe(true);
  const id = (await created.json())?.data?.id as string;
  try {
    await page.goto(`/bottles?collection=${id}`);
    const back = page.getByTestId('back-to-collections');
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(/\/collections$/);
  } finally {
    await page.request.delete(`/api/collections/${id}`);
  }
});
