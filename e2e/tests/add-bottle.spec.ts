import { test, expect, type APIResponse } from '@playwright/test';

type Unit = { id: string; productId: string; quantity: number | null; purchasePrice: number | null; purchasedAt: string | null };
type Family = { id: string; items: Unit[]; tastings?: { id: string }[] };

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

/** Today, as the browser's date field shows it (YYYY-MM-DD, D6). */
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// ux-ui.md 6.1 "Adding a bottle" — the application's main journey. Shared
// inventory, so the created item is always cleaned up via the API.
// #471 (FEAT-92 c1): 6 bottles in one entry are one wine (one card ×6), one
// line of 6 at 20 € each, worth 120 €.
test('add 6 bottles through the form, see one wine ×6 worth 120 €, then "Vous avez déjà ce vin" (FEAT-97)', async ({ page }) => {
  const name = `E2E Bottle ${Date.now()}`;
  const producer = 'E2E Domaine';
  let id: string | undefined;
  let productId: string | undefined;
  let otherProductId: string | undefined;

  try {
    await page.goto('/bottles');

    await page.getByTestId('inventory-add-button').click();
    const dialog = page.getByRole('dialog');

    await dialog.getByTestId('inventory-name-input').fill(name);
    await dialog.getByTestId('inventory-producer-input').fill(producer);
    await dialog.getByTestId('inventory-vintage-input').fill('2020');
    // With the cellar: how many, the price of one bottle, and when (today by default).
    await expect(dialog.getByTestId('inventory-purchased-at-input')).toHaveValue(today());
    await dialog.getByTestId('inventory-quantity-input').fill('6');
    await dialog.getByTestId('inventory-unit-price-input').pressSequentially('20');

    const created = page.waitForResponse(
      (r) => r.url().match(/\/api\/inventory\/?$/) !== null && r.request().method() === 'POST',
    );
    await dialog.getByTestId('inventory-form-submit').click();

    const res = await created;
    expect(res.status()).toBe(201);
    expect(res.request().postDataJSON()).toMatchObject({ quantity: 6, purchasePrice: 20, purchasedAt: today() });
    const item = (await res.json())?.data as Unit;
    id = item.id;
    productId = item.productId;
    expect(id).toBeTruthy();

    await expect(dialog).toBeHidden();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    // #471 §10.2: one card for the wine, counting its 6 bottles.
    const card = page.getByTestId('family-card').filter({ hasText: name });
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId('family-card-badge')).toHaveText('6');

    // One wine, one line of 6 bottles at 20 € bought today (D6: a day, never a time).
    const family = await okData<Family>(await page.request.get(`/api/products/${productId}`));
    expect(family.items.map((unit) => [unit.quantity, unit.purchasePrice, unit.purchasedAt])).toEqual([[6, 20, today()]]);

    // Its drawer: one line ×6, worth 120 €.
    await page.goto(`/bottles?scan=${encodeURIComponent(productId)}`);
    const drawer = page.getByRole('dialog').filter({ has: page.locator('#inventory-detail-title') });
    await expect(drawer.getByTestId('family-line')).toHaveCount(1);
    await expect(drawer.getByTestId('family-line')).toContainText('×6');
    await expect(drawer.getByTestId('family-drawer-stock')).toContainText('6 bouteilles');
    await expect(drawer.getByTestId('family-drawer-stock')).toContainText(/valeur estimée 120/);
    await drawer.getByRole('button', { name: 'Fermer' }).first().click();
    await expect(drawer).toBeHidden();

    // #471 (FEAT-97 c1-c2): the same wine typed again says "Vous avez déjà
    // ce vin" before any save (case and edge spaces ignored); accepting
    // reduces the form to the bottles, which join the wine on a new line
    // (another price): no second card, the description unchanged.
    await page.getByTestId('inventory-add-button').click();
    const dialog2 = page.getByRole('dialog');
    await dialog2.getByTestId('inventory-name-input').fill(` ${name.toUpperCase()} `);
    await dialog2.getByTestId('inventory-producer-input').fill(producer.toLowerCase());
    await dialog2.getByTestId('inventory-vintage-input').fill('2019');
    // c3: another vintage is another wine.
    await page.waitForTimeout(800);
    await expect(dialog2.getByTestId('known-wine-banner')).toHaveCount(0);
    await dialog2.getByTestId('inventory-vintage-input').fill('2020');
    const banner = dialog2.getByTestId('known-wine-banner');
    await expect(banner).toContainText('Vous avez déjà ce vin');
    await expect(banner.getByTestId('known-wine-stock')).toContainText('6 bouteilles en cave');
    await banner.getByTestId('known-wine-add').click();
    await expect(dialog2.getByTestId('inventory-name-input')).toHaveCount(0);
    await dialog2.getByTestId('add-units-quantity').fill('3');
    await dialog2.getByTestId('add-units-price').fill('');
    await dialog2.getByTestId('add-units-price').pressSequentially('25');
    const added = page.waitForResponse((r) => r.url().endsWith(`/api/products/${productId}/items`) && r.request().method() === 'POST');
    await dialog2.getByTestId('add-units-submit').click();
    expect((await added).status()).toBe(201);
    await expect(dialog2).toBeHidden();
    await expect(page.getByTestId('family-card').filter({ hasText: name })).toHaveCount(1);
    const joined = await okData<Family & { region: string | null; name: string }>(await page.request.get(`/api/products/${productId}`));
    expect(joined.name).toBe(name);
    expect(joined.items.map((unit) => [unit.quantity, unit.purchasePrice]).sort()).toEqual([[3, 25], [6, 20]]);

    // c5: "C'est un autre vin" creates a second card of the same name, never
    // proposed in "À regrouper ?".
    await page.getByTestId('inventory-add-button').click();
    const dialog3 = page.getByRole('dialog');
    await dialog3.getByTestId('inventory-name-input').fill(name);
    await dialog3.getByTestId('inventory-producer-input').fill(producer);
    await dialog3.getByTestId('inventory-vintage-input').fill('2020');
    await dialog3.getByTestId('known-wine-distinct').click();
    await expect(dialog3.getByTestId('known-wine-banner')).toHaveCount(0);
    const createdApart = page.waitForResponse(
      (r) => r.url().match(/\/api\/inventory\/?$/) !== null && r.request().method() === 'POST',
    );
    await dialog3.getByTestId('inventory-form-submit').click();
    const apartRes = await createdApart;
    expect(apartRes.status()).toBe(201);
    expect(apartRes.request().postDataJSON()).toMatchObject({ distinctFrom: [productId] });
    otherProductId = ((await apartRes.json()).data as Unit).productId;
    expect(otherProductId).not.toBe(productId);
    await expect(dialog3).toBeHidden();
    await expect(page.getByTestId('family-card').filter({ hasText: name })).toHaveCount(2);
    const review = await okData<{ merges: { products: { id: string }[] }[] }>(await page.request.get('/api/products/review'));
    expect(review.merges.filter((c) => c.products.some((p) => p.id === productId || p.id === otherProductId))).toEqual([]);
  } finally {
    if (otherProductId) await page.request.delete(`/api/products/${otherProductId}`).catch(() => {});
    if (productId) await page.request.delete(`/api/products/${productId}`).catch(() => {});
    else if (id) await page.request.delete(`/api/inventory/${id}`).catch(() => {});
  }
});

// #471 (FEAT-101 c1-c3): a wine whose last bottle is gone is hidden from
// the list, shown by "Plus en cave" with "Plus de bouteille"; "Ajouter des
// bouteilles" in its drawer brings it back with 3 bottles, its tasting kept.
test('add 3 bottles to a wine without any bottle left, from its drawer', async ({ page }) => {
  const api = page.request;
  const name = `E2E No bottle ${Date.now()}-${Math.round(Math.random() * 1e4)}`;
  const first = await okData<Unit>(await api.post('/api/inventory', {
    data: { category: 'wine', name, producer: 'E2E Domaine', vintage: 2018, purchasePrice: 15 },
  }));
  const { productId } = first;
  try {
    await okData(await api.post('/api/tastings', { data: { itemId: first.id, rating: 4 } }));
    // Its only bottle given away: the wine has none left.
    const gone = await api.post(`/api/inventory/${first.id}/correct`, { data: { quantity: 0, reason: 'written_off' } });
    expect(gone.ok(), await gone.text()).toBe(true);

    await page.goto('/bottles');
    const card = page.getByTestId('family-card').filter({ hasText: name });
    await expect(card).toHaveCount(0);
    const goneFilter = page.getByRole('button', { name: 'Plus en cave', exact: true }).locator('visible=true');
    if ((await goneFilter.count()) === 0) await page.getByRole('button', { name: 'Filtrer', exact: true }).click();
    await goneFilter.first().click();
    await expect(card.getByTestId('family-stock-line')).toContainText('Plus de bouteille');
    await goneFilter.first().click();
    await expect(card).toHaveCount(0);

    await page.goto(`/bottles?scan=${encodeURIComponent(productId)}`);
    const drawer = page.getByRole('dialog').filter({ has: page.locator('#inventory-detail-title') });
    await expect(drawer.locator('#inventory-detail-title')).toHaveText(name);
    await drawer.getByTestId('add-units-button').click();
    const form = page.getByRole('dialog').filter({ has: page.getByTestId('add-units-submit') });
    await expect(form.getByTestId('add-units-purchased-at')).toHaveValue(today());
    await form.getByTestId('add-units-quantity').fill('3');
    const added = page.waitForResponse((r) => r.url().endsWith(`/api/products/${productId}/items`) && r.request().method() === 'POST');
    await form.getByTestId('add-units-submit').click();
    const res = await added;
    expect(res.status(), await res.text()).toBe(201);
    expect(res.request().postDataJSON()).toMatchObject({ quantity: 3, purchasedAt: today() });
    await expect(form).toBeHidden();
    await expect(page.getByText(`3 bouteilles ajoutées à ${name} 2018`)).toBeVisible();

    // The drawer follows at once, its tasting kept.
    await expect(drawer.getByTestId('family-drawer-stock')).toContainText('3 bouteilles');
    await expect(drawer.getByTestId('family-tastings').locator('li')).toHaveCount(1);
    await drawer.getByRole('button', { name: 'Fermer' }).first().click();

    // Back in the list by default, with its 3 bottles.
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId('family-card-badge')).toHaveText('3');
    const family = await okData<Family>(await api.get(`/api/products/${productId}`));
    expect(family.tastings).toHaveLength(1);
  } finally {
    await api.delete(`/api/products/${productId}`).catch(() => {});
  }
});
