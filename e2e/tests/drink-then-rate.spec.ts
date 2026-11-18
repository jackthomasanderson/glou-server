import { test, expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';

/**
 * #1036: "J'en bois une" in a wine's drawer, then "Dégustation". The form
 * offered the bottles left, then "Mettre à jour le stock ?" took a second one
 * out; the last bottle drunk left the tasting "Goûté ailleurs"; and the
 * drink's "Annuler" message lay over the form. The tasting is now of the
 * bottle just drunk, the stock untouched by it.
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

type Unit = { id: string; productId: string; quantity: number | null; isOpened: boolean; fillLevel: number | null; deletedAt?: string | null };
type Tasting = { id: string; itemId: string | null; productId: string | null };
type Family = { items: Unit[]; tastings: Tasting[] };

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

async function wineOf(api: APIRequestContext, name: string, quantity: number): Promise<Unit> {
  return okData<Unit>(await api.post('/api/inventory', {
    data: { category: 'wine', name, producer: 'E2E Domaine', vintage: 2018, purchasePrice: 20, quantity },
  }));
}

async function openDrawer(page: Page, productId: string, name: string) {
  await page.goto(`/bottles?scan=${encodeURIComponent(productId)}`);
  const drawer = page.getByRole('dialog').filter({ has: page.locator('#inventory-detail-title') });
  await expect(drawer.locator('#inventory-detail-title')).toHaveText(name);
  return drawer;
}

/** "J'en bois une", then "Dégustation" saved: the id of the copy drunk and the tasting's request. */
async function drinkThenRate(page: Page, productId: string, name: string, lineId: string) {
  const drawer = await openDrawer(page, productId, name);
  const drunk = page.waitForResponse((r) => r.url().endsWith(`/api/inventory/${lineId}`) && r.request().method() === 'PATCH');
  await drawer.getByTestId('stock-move-drink').click();
  const drinkRes = await drunk;
  expect(drinkRes.status(), await drinkRes.text()).toBe(200);
  const copyId = ((await drinkRes.json()).data as Unit).id;
  // The message, not the drawer's own lines saying the same (its history, its movements).
  const undoMessage = page.locator('[data-toast]').filter({ hasText: '1 bouteille bue' });
  await expect(undoMessage).toBeVisible();

  await drawer.getByRole('button', { name: 'Dégustation', exact: true }).click();
  const form = page.getByRole('dialog').filter({ hasText: 'Nouvelle dégustation' });
  await expect(form).toBeVisible();
  // The message no longer lies over the form (its "Annuler" beside the form's own).
  await expect(undoMessage).toBeHidden();
  await expect(form.getByRole('radio', { name: 'Oui' })).toBeChecked();

  const created = page.waitForResponse((r) => /\/api\/tastings\/?$/.test(r.url()) && r.request().method() === 'POST');
  await form.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  const res = await created;
  expect(res.status(), await res.text()).toBe(201);
  await expect(form).toBeHidden();
  // The bottle is out of the stock already: no question.
  await expect(page.getByRole('dialog').filter({ hasText: 'Mettre à jour le stock ?' })).toHaveCount(0);
  return { drawer, copyId, sent: res.request().postDataJSON() as { itemId?: string } };
}

test('several bottles left: the tasting is of the bottle just drunk, one bottle out', async ({ page }) => {
  const api = page.request;
  const name = `E2E #1036 x3 ${stamp()}`;
  const group = await wineOf(api, name, 3);
  try {
    const { drawer, copyId, sent } = await drinkThenRate(page, group.productId, name, group.id);
    expect(copyId).not.toBe(group.id);
    expect(sent.itemId).toBe(copyId);

    const family = await okData<Family>(await api.get(`/api/products/${group.productId}`));
    const items = family.items.filter((unit) => unit.deletedAt == null);
    expect(items.find((unit) => unit.id === group.id)).toMatchObject({ quantity: 2, isOpened: false });
    expect(items.find((unit) => unit.id === copyId)).toMatchObject({ isOpened: true, fillLevel: 0 });
    expect(family.tastings).toEqual([expect.objectContaining({ itemId: copyId, productId: group.productId })]);
    await expect(drawer.getByTestId('family-drawer-stock')).toContainText('2 bouteilles');
    await expect(drawer.getByTestId('family-tastings')).not.toContainText('Goûté ailleurs');
  } finally {
    await api.delete(`/api/products/${group.productId}`).catch(() => {});
  }
});

test('the last bottle: the tasting is of it, never "Goûté ailleurs"', async ({ page }) => {
  const api = page.request;
  const name = `E2E #1036 x1 ${stamp()}`;
  const bottle = await wineOf(api, name, 1);
  try {
    const { drawer, copyId, sent } = await drinkThenRate(page, bottle.productId, name, bottle.id);
    expect(copyId).toBe(bottle.id);
    expect(sent.itemId).toBe(bottle.id);

    const family = await okData<Family>(await api.get(`/api/products/${bottle.productId}`));
    expect(family.items.filter((unit) => unit.deletedAt == null)).toEqual([
      expect.objectContaining({ id: bottle.id, isOpened: true, fillLevel: 0 }),
    ]);
    expect(family.tastings).toEqual([expect.objectContaining({ itemId: bottle.id, productId: bottle.productId })]);
    await expect(drawer.getByTestId('family-tastings')).toBeVisible();
    await expect(drawer.getByTestId('family-tastings')).not.toContainText('Goûté ailleurs');
  } finally {
    await api.delete(`/api/products/${bottle.productId}`).catch(() => {});
  }
});
