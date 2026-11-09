import { test, expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';

/**
 * #471 (FEAT-107): every tasting of a wine on the wine (the family), whichever
 * bottle was tasted; a tasting "sans bouteille" on a wine in stock leaves
 * its stock alone; a wine never had, named in "Nouvelle dégustation", is
 * added without any bottle ("Plus en cave"). c3 ("bouteille finie" on a ×6)
 * is in tasting-edit-stock.spec.ts.
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

type Unit = { id: string; productId: string; quantity: number | null };
type Tasting = { id: string; itemId: string | null; productId: string | null };
type Family = { id: string; name: string; items: Unit[]; tastings: Tasting[] };

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

/** A wine of 6 bottles at 20 €, as one entry of the add form. */
async function wineOfSix(api: APIRequestContext, name: string): Promise<Unit> {
  return okData<Unit>(await api.post('/api/inventory', {
    data: { category: 'wine', name, producer: 'E2E Domaine', vintage: 2018, purchasePrice: 20, quantity: 6 },
  }));
}

/** The drawer of a wine, opened from its link. */
async function openDrawer(page: Page, productId: string, name: string) {
  await page.goto(`/bottles?scan=${encodeURIComponent(productId)}`);
  const drawer = page.getByRole('dialog').filter({ has: page.locator('#inventory-detail-title') });
  await expect(drawer.locator('#inventory-detail-title')).toHaveText(name);
  return drawer;
}

// c1: two bottles of two different lines tasted → both tastings on the wine.
test('the tastings of two lines of a wine are both on its drawer', async ({ page }) => {
  const api = page.request;
  const name = `E2E FEAT-107 c1 ${stamp()}`;
  const first = await wineOfSix(api, name);
  try {
    const other = await okData<Unit>(await api.post(`/api/products/${first.productId}/items`, {
      data: { quantity: 2, purchasePrice: 35 },
    }));
    expect(other.id).not.toBe(first.id);
    await okData(await api.post('/api/tastings', { data: { itemId: first.id, rating: 4, notes: 'Line of 6' } }));
    await okData(await api.post('/api/tastings', { data: { itemId: other.id, rating: 2, notes: 'Line of 2' } }));

    const family = await okData<Family>(await api.get(`/api/products/${first.productId}`));
    expect(family.tastings.map((tasting) => tasting.itemId).sort()).toEqual([first.id, other.id].sort());

    const drawer = await openDrawer(page, first.productId, name);
    const tastings = drawer.getByTestId('family-tastings').locator('li');
    await expect(tastings).toHaveCount(2);
    await expect(tastings.filter({ hasText: 'Line of 6' })).toContainText('20');
    await expect(tastings.filter({ hasText: 'Line of 2' })).toContainText('35');
  } finally {
    await api.delete(`/api/products/${first.productId}`).catch(() => {});
  }
});

// c2: "sans bouteille" on a wine in stock: its 6 bottles stay, the tasting is on it.
test('a tasting elsewhere of a wine in stock leaves its 6 bottles', async ({ page }) => {
  const api = page.request;
  const name = `E2E FEAT-107 c2 ${stamp()}`;
  const group = await wineOfSix(api, name);
  try {
    const drawer = await openDrawer(page, group.productId, name);
    await drawer.getByRole('button', { name: 'Dégustation', exact: true }).click();
    const form = page.getByRole('dialog').filter({ hasText: 'Nouvelle dégustation' });
    await expect(form.getByText('Sur une bouteille de la cave ?')).toBeVisible();
    // HeroUI lays the radio input over its label: the radio itself takes the click.
    const elsewhere = form.getByRole('radio', { name: 'Non, goûté ailleurs' });
    await elsewhere.click();
    await expect(elsewhere).toBeChecked();

    const created = page.waitForResponse((r) => /\/api\/tastings\/?$/.test(r.url()) && r.request().method() === 'POST');
    await form.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    const res = await created;
    expect(res.status(), await res.text()).toBe(201);
    expect(res.request().postDataJSON()).toMatchObject({ productId: group.productId });
    expect(res.request().postDataJSON()).not.toHaveProperty('itemId');
    await expect(form).toBeHidden();
    // Nothing to update in the stock: no question.
    await expect(page.getByRole('dialog').filter({ hasText: 'Mettre à jour le stock ?' })).toHaveCount(0);

    await expect(drawer.getByTestId('family-tastings').locator('li')).toHaveCount(1);
    await expect(drawer.getByTestId('family-tastings')).toContainText('Goûté ailleurs');
    await expect(drawer.getByTestId('family-drawer-stock')).toContainText('6 bouteilles');
    const family = await okData<Family>(await api.get(`/api/products/${group.productId}`));
    expect(family.items).toEqual([expect.objectContaining({ id: group.id, quantity: 6 })]);
    expect(family.tastings).toEqual([expect.objectContaining({ itemId: null, productId: group.productId })]);
  } finally {
    await api.delete(`/api/products/${group.productId}`).catch(() => {});
  }
});

// c4: a wine never had → a wine without any bottle, in "Plus en cave", with
// its tasting; adding 0 bottles to it is refused.
test('"Nouvelle dégustation" of a wine never had adds it without any bottle', async ({ page }) => {
  const api = page.request;
  const name = `E2E FEAT-107 c4 ${stamp()}`;
  let productId = '';
  try {
    await page.goto('/tastings');
    await page.getByRole('button', { name: 'Nouvelle dégustation' }).first().click();
    const form = page.getByRole('dialog').filter({ hasText: 'Nouvelle dégustation' });
    await form.getByRole('button', { name: "Ce vin n'est pas dans la liste" }).click();
    await form.getByLabel(/^Producteur/).fill('E2E Domaine Ailleurs');
    await form.getByLabel(/^Nom/).fill(name);
    await form.getByLabel(/^Millésime/).fill('2019');

    const created = page.waitForResponse((r) => /\/api\/tastings\/?$/.test(r.url()) && r.request().method() === 'POST');
    await form.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    const res = await created;
    expect(res.status(), await res.text()).toBe(201);
    expect(res.request().postDataJSON()).toMatchObject({
      wine: { category: 'wine', producer: 'E2E Domaine Ailleurs', name, vintage: 2019 },
    });
    const tasting = (await res.json()).data as Tasting;
    productId = tasting.productId ?? '';
    expect(tasting.itemId).toBeNull();
    expect(productId).not.toBe('');
    await expect(form).toBeHidden();
    await expect(page.getByRole('dialog').filter({ hasText: 'Mettre à jour le stock ?' })).toHaveCount(0);

    // Noted again by its name: the same wine, not a second one.
    const again = await okData<Tasting>(await api.post('/api/tastings', {
      data: { wine: { category: 'wine', producer: 'e2e domaine ailleurs ', name: name.toUpperCase(), vintage: 2019 } },
    }));
    expect(again.productId).toBe(productId);

    const family = await okData<Family>(await api.get(`/api/products/${productId}`));
    expect(family.items).toEqual([]);
    expect(family.tastings).toHaveLength(2);

    // Hidden by default, shown by "Plus en cave".
    await page.goto('/bottles');
    const card = page.getByTestId('family-card').filter({ hasText: name });
    await expect(card).toHaveCount(0);
    const goneFilter = page.getByRole('button', { name: 'Plus en cave', exact: true }).locator('visible=true');
    if ((await goneFilter.count()) === 0) await page.getByRole('button', { name: 'Filtrer', exact: true }).click();
    await goneFilter.first().click();
    await expect(card.getByTestId('family-stock-line')).toContainText('Plus de bouteille');

    // No "0 bouteille" add.
    const zero = await api.post(`/api/products/${productId}/items`, { data: { quantity: 0 } });
    expect(zero.status()).toBe(400);
  } finally {
    if (productId) await api.delete(`/api/products/${productId}`).catch(() => {});
  }
});

// Acceptance run v3 of #471: « 202 » refused, then corrected to « 2020 » — the
// message stayed and the save was blocked; « 2020 » typed at once passed.
test('a vintage corrected from 202 to 2020 in "Nouvelle dégustation" saves', async ({ page }) => {
  const name = `E2E RE vintage ${stamp()}`;
  let productId = '';
  try {
    await page.goto('/tastings');
    await page.getByRole('button', { name: 'Nouvelle dégustation' }).first().click();
    const form = page.getByRole('dialog').filter({ hasText: 'Nouvelle dégustation' });
    await form.getByRole('button', { name: "Ce vin n'est pas dans la liste" }).click();
    await form.getByLabel(/^Producteur/).fill('E2E Domaine Ailleurs');
    await form.getByLabel(/^Nom/).fill(name);
    const vintage = form.getByLabel(/^Millésime/);
    await vintage.pressSequentially('202');
    await form.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    const message = form.getByText(/^Millésime sur 4 chiffres/);
    await expect(message).toBeVisible();

    // As a person would: back in the field, at the end of what was typed.
    await vintage.focus();
    await vintage.press('End');
    await vintage.pressSequentially('0');
    await expect(vintage).toHaveValue('2020');
    await expect(message).toHaveCount(0);
    const created = page.waitForResponse((r) => /\/api\/tastings\/?$/.test(r.url()) && r.request().method() === 'POST');
    await form.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    const res = await created;
    expect(res.status(), await res.text()).toBe(201);
    expect(res.request().postDataJSON()).toMatchObject({ wine: { name, vintage: 2020 } });
    productId = ((await res.json()).data as Tasting).productId ?? '';
    await expect(form).toBeHidden();
  } finally {
    if (productId) await page.request.delete(`/api/products/${productId}`).catch(() => {});
  }
});
