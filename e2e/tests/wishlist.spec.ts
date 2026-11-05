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
    const count = dialog.getByTestId('wishlist-convert-quantity');
    await expect(count).toHaveValue('6');
    // Emptied, the number is asked again — never the number wished for in silence.
    await count.fill('');
    await dialog.getByTestId('wishlist-convert-submit').click();
    await expect(dialog.getByText('Entre 1 et 1000')).toBeVisible();
    await count.fill('6');
    // The price of one bottle reads "24,05" as 24.05 (#725), not 2405.
    await dialog.getByTestId('wishlist-convert-price').pressSequentially('24,05');

    const converted = page.waitForResponse((r) => r.url().endsWith(`/api/wishlist/items/${wishId}/convert`) && r.request().method() === 'POST');
    await dialog.getByTestId('wishlist-convert-submit').click();
    const res = await converted;
    expect(res.ok(), await res.text()).toBe(true);
    expect(res.request().postDataJSON()).toMatchObject({ quantity: 6, purchasePrice: 24.05 });
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

// #471 (FEAT-97 c4): a wish for a wine already in the cellar says "Vous avez
// déjà ce vin"; accepted, the bottles join that wine — bought today, they
// form a new line next to the one bought in January (same cellar — none — and price).
test('a wish for a wine already known joins it, on a new line dated today', async ({ page }) => {
  const api = page.request;
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e4)}`;
  const name = `E2E Wish known ${stamp}`;
  const bottleRes = await api.post('/api/inventory', {
    data: { category: 'wine', name, producer: 'E2E Domaine', vintage: 2018, quantity: 6, purchasePrice: 20, purchasedAt: '2026-01-15' },
  });
  expect(bottleRes.ok(), await bottleRes.text()).toBe(true);
  const productId = (await bottleRes.json()).data.productId as string;
  const wishRes = await api.post('/api/wishlist/items', {
    data: { name, producer: 'E2E Domaine', category: 'wine', vintage: 2018, targetQuantity: 2 },
  });
  expect(wishRes.ok(), await wishRes.text()).toBe(true);
  const wishId = (await wishRes.json()).data.id as string;
  try {
    await page.goto('/wishlist-budget');
    await page.getByTestId('wishlist-item').filter({ hasText: name }).getByTestId('wishlist-convert-button').click();
    const dialog = page.getByRole('dialog');
    const banner = dialog.getByTestId('known-wine-banner');
    await expect(banner).toContainText('Vous avez déjà ce vin');
    await expect(banner.getByTestId('known-wine-stock')).toContainText('6 bouteilles en cave');
    await banner.getByTestId('known-wine-add').click();
    await expect(dialog.getByTestId('known-wine-joining')).toBeVisible();
    await dialog.getByTestId('wishlist-convert-price').fill('');
    await dialog.getByTestId('wishlist-convert-price').pressSequentially('20');

    const converted = page.waitForResponse((r) => r.url().endsWith(`/api/wishlist/items/${wishId}/convert`) && r.request().method() === 'POST');
    await dialog.getByTestId('wishlist-convert-submit').click();
    const res = await converted;
    expect(res.ok(), await res.text()).toBe(true);
    expect(res.request().postDataJSON()).toMatchObject({ productId, quantity: 2, purchasePrice: 20 });
    expect((await res.json()).data.inventoryItem.productId).toBe(productId);

    const family = (await (await api.get(`/api/products/${productId}`)).json()).data as {
      items: { quantity: number | null; purchasedAt: string | null }[];
    };
    const lines = family.items.map((unit) => [unit.quantity, unit.purchasedAt]);
    expect(lines).toHaveLength(2);
    expect(lines).toContainEqual([6, '2026-01-15']);
    expect(lines.find(([quantity]) => quantity === 2)?.[1]).not.toBe('2026-01-15');
  } finally {
    await api.delete(`/api/products/${productId}`).catch(() => {});
    await api.delete(`/api/wishlist/items/${wishId}`).catch(() => {});
  }
});

// Review #817: joining starts from the wine's latest line — its size (75 cl),
// cellar and price — so a wish bought the same day, same cellar and price,
// completes that line (×6 → ×8) instead of a second line without size.
test('a wish for a known 75 cl wine completes its line bought the same day', async ({ page }) => {
  const api = page.request;
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e4)}`;
  const name = `E2E Wish 75cl ${stamp}`;
  const cellarRes = await api.post('/api/cellars', { data: { name: `E2E Wish cave ${stamp}`, columns: 2, rows: 2 } });
  expect(cellarRes.ok(), await cellarRes.text()).toBe(true);
  const cellarId = (await cellarRes.json()).data.id as string;
  // Bought today (the API's default day), as the conversion will be.
  const bottleRes = await api.post('/api/inventory', {
    data: { category: 'wine', name, producer: 'E2E Domaine', vintage: 2018, quantity: 6, purchasePrice: 20, bottleSize: '75cl', cellarId },
  });
  expect(bottleRes.ok(), await bottleRes.text()).toBe(true);
  const productId = (await bottleRes.json()).data.productId as string;
  const wishRes = await api.post('/api/wishlist/items', {
    data: { name, producer: 'E2E Domaine', category: 'wine', vintage: 2018, targetQuantity: 2 },
  });
  expect(wishRes.ok(), await wishRes.text()).toBe(true);
  const wishId = (await wishRes.json()).data.id as string;
  try {
    await page.goto('/wishlist-budget');
    await page.getByTestId('wishlist-item').filter({ hasText: name }).getByTestId('wishlist-convert-button').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByTestId('known-wine-add').click();
    await expect(dialog.getByTestId('known-wine-joining')).toBeVisible();

    const converted = page.waitForResponse((r) => r.url().endsWith(`/api/wishlist/items/${wishId}/convert`) && r.request().method() === 'POST');
    await dialog.getByTestId('wishlist-convert-submit').click();
    const res = await converted;
    expect(res.ok(), await res.text()).toBe(true);
    expect(res.request().postDataJSON()).toMatchObject({ productId, quantity: 2, bottleSize: '75cl', cellarId, purchasePrice: 20 });

    const family = (await (await api.get(`/api/products/${productId}`)).json()).data as {
      items: { quantity: number | null; bottleSize: string | null }[];
    };
    expect(family.items.map((unit) => [unit.quantity, unit.bottleSize])).toEqual([[8, '75cl']]);
  } finally {
    await api.delete(`/api/products/${productId}`).catch(() => {});
    await api.delete(`/api/wishlist/items/${wishId}`).catch(() => {});
    await api.delete(`/api/cellars/${cellarId}`).catch(() => {});
  }
});
