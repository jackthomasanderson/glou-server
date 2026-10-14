import { test, expect } from '@playwright/test';

// Wishlist entries are per-user — safe to mutate. Creation is exercised
// through the UI; cleanup uses the same API the app calls.
test('add a wishlist item through the form, see it, then remove it', async ({ page }) => {
  const name = `E2E Wish ${Date.now()}`;

  await page.goto('/wishlist');

  const created = page.waitForResponse(
    (r) => r.url().includes('/api/wishlist/items') && r.request().method() === 'POST',
  );
  await page.getByTestId('wishlist-create-button').first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByTestId('wishlist-name-input').fill(name);
  await dialog.getByTestId('wishlist-form-submit').click();

  const res = await created;
  expect(res.ok()).toBe(true);
  const id = (await res.json())?.data?.id as string;
  expect(id).toBeTruthy();

  await expect(dialog).toBeHidden();
  await expect(page.getByText(name, { exact: false }).first()).toBeVisible();

  // Clean up via the app's own endpoint, then confirm it's gone from the list.
  const del = await page.request.delete(`/api/wishlist/items/${id}`);
  expect(del.ok()).toBe(true);
  await page.reload();
  await expect(page.getByText(name, { exact: false })).toHaveCount(0);
});
