import { test, expect } from '@playwright/test';

// Wishlist entries are per-user — safe to mutate. Creation is exercised
// through the UI; cleanup uses the same API the app calls.
test('add a wishlist item through the form, see it, then remove it', async ({ page }) => {
  const name = `E2E Wish ${Date.now()}`;

  await page.goto('/wishlist-budget');

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

// #471 (FEAT-92, decision point 15): turning a wish for 6 bottles into stock
// creates one wine with one line of 6 bottles, not 6 entries nor 1 bottle.
test('a wish for 6 bottles turned into stock is one wine ×6', async ({ page }) => {
  const api = page.request;
  const name = `E2E Wish x6 ${Date.now()}-${Math.round(Math.random() * 1e4)}`;
  const created = await api.post('/api/wishlist/items', {
    data: { name, producer: 'E2E Domaine', category: 'wine', vintage: 2019, targetQuantity: 6 },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const wishId = (await created.json()).data.id as string;
  let productId: string | undefined;
  try {
    await page.goto('/wishlist-budget');
    const row = page.getByTestId('wishlist-item').filter({ hasText: name });
    await row.getByTestId('wishlist-convert-button').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('wishlist-convert-quantity')).toHaveValue('6');

    const converted = page.waitForResponse((r) => r.url().endsWith(`/api/wishlist/items/${wishId}/convert`) && r.request().method() === 'POST');
    await dialog.getByTestId('wishlist-convert-submit').click();
    const res = await converted;
    expect(res.ok(), await res.text()).toBe(true);
    productId = (await res.json()).data.inventoryItem.productId as string;
    await expect(dialog).toBeHidden();

    const family = (await (await api.get(`/api/products/${productId}`)).json()).data as {
      items: { quantity: number | null; purchasedAt: string | null }[];
    };
    expect(family.items.map((unit) => unit.quantity)).toEqual([6]);
    expect(family.items[0].purchasedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await page.goto(`/bottles?q=${encodeURIComponent(name)}`);
    const card = page.getByTestId('family-card').filter({ hasText: name });
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId('family-card-badge')).toHaveText('6');
  } finally {
    if (productId) await api.delete(`/api/products/${productId}`).catch(() => {});
    await api.delete(`/api/wishlist/items/${wishId}`).catch(() => {});
  }
});
