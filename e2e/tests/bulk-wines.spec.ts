import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { collectPageProblems } from './_helpers';

/**
 * #471 (FEAT-111 c1-c4, D18): the bulk actions on wines selected in the list
 * — "Déplacer", "Mettre à la corbeille", "Marquer comme bus" — on a real
 * PostgreSQL. They act on every bottle IN STOCK of the wines (the stock
 * filter, NULL-safe, and the listed-family filter are SQL), never a drunk one.
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

type Unit = {
  id: string; productId: string; cellarId: string | null; quantity: number | null; isOpened: boolean;
  fillLevel: number | null; writtenOffAt: string | null; deletedAt: string | null; parentItemId: string | null;
};
type Detail = { id: string; items: Unit[] };

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

async function createCellar(api: APIRequestContext, label: string): Promise<string> {
  return (await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E #471 P ${label} ${stamp()}` } }))).id;
}

/** A wine of `quantity` bottles in `cellarId`, bought today at 20 €. */
async function addWine(api: APIRequestContext, name: string, quantity: number, cellarId: string): Promise<Unit> {
  return okData<Unit>(await api.post('/api/inventory', {
    data: { category: 'wine', name, producer: 'E2E Domaine P', quantity, cellarId, purchasePrice: 20 },
  }));
}

const detail = async (api: APIRequestContext, productId: string) => okData<Detail>(await api.get(`/api/products/${productId}`));
const isGone = (unit: Unit) => unit.writtenOffAt != null || (unit.isOpened && unit.fillLevel === 0);
/** Bottles in stock of a wine, per cellar. */
async function inStockByCellar(api: APIRequestContext, productId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const unit of (await detail(api, productId)).items) {
    if (unit.deletedAt || isGone(unit)) continue;
    const key = unit.cellarId ?? 'none';
    counts[key] = (counts[key] ?? 0) + (unit.isOpened ? 1 : unit.quantity ?? 1);
  }
  return counts;
}

/**
 * Three wines, 14 bottles in the cellar: ×6 (one of them opened at 60 %), ×5
 * and ×3 — and a bottle of the first already drunk (c4).
 */
async function threeWines(api: APIRequestContext, garage: string, label: string) {
  const a = await addWine(api, `E2E P ${label} Alpha`, 7, garage);
  const b = await addWine(api, `E2E P ${label} Beta`, 5, garage);
  const c = await addWine(api, `E2E P ${label} Gamma`, 3, garage);
  // One drunk, then one opened, each detached from the ×7: ×5 + an opened one + a drunk one — 6 + 5 + 3 = 14 in stock.
  await okData(await api.patch(`/api/inventory/${a.id}`, { data: { isOpened: true, fillLevel: 0 } }));
  await okData(await api.patch(`/api/inventory/${a.id}`, { data: { isOpened: true, fillLevel: 60, openedAt: new Date().toISOString() } }));
  return { a, b, c, productIds: [a.productId, b.productId, c.productId] };
}

test.describe('bulk actions on wines (FEAT-111)', () => {
  const families: string[] = [];
  test.afterEach(async ({ page }) => {
    for (const productId of families.splice(0)) await page.request.delete(`/api/products/${productId}`).catch(() => {});
  });

  test('c1, c4: "Déplacer" from the selection says "3 vins, 14 bouteilles", then the 14 are in the kitchen; the drunk one stays', async ({ page }, testInfo) => {
    const problems = collectPageProblems(page, testInfo);
    const api = page.request;
    const label = stamp();
    const garage = await createCellar(api, 'Garage');
    const kitchen = await createCellar(api, 'Cuisine');
    const { a, productIds } = await threeWines(api, garage, label);
    families.push(...productIds);

    await page.goto(`/bottles?q=${encodeURIComponent(`E2E P ${label}`)}`);
    await page.getByRole('button', { name: 'Vue en liste' }).click();
    const rows = page.getByRole('row').filter({ hasText: `E2E P ${label}` });
    await expect(rows).toHaveCount(3);
    await page.getByRole('button', { name: 'Sélectionner', exact: true }).click();
    await rows.nth(0).getByText(`E2E P ${label}`).click();
    await rows.nth(2).getByText(`E2E P ${label}`).click({ modifiers: ['Shift'] });
    await expect(page.getByText('3 sélectionnés', { exact: true })).toBeVisible();

    await page.getByTestId('bulk-actions-menu').click();
    await page.locator('[role="menuitem"]').filter({ hasText: 'Déplacer' }).click();
    const dialog = page.getByTestId('bulk-wines-dialog');
    await expect(dialog.getByTestId('bulk-wines-summary')).toHaveText('3 vins, 14 bouteilles');
    await dialog.getByRole('radio', { name: /^E2E #471 P Cuisine/ }).check();
    const moved = page.waitForResponse((r) => r.url().endsWith('/api/products/bulk-move') && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Déplacer', exact: true }).click();
    const response = await moved;
    expect(response.status()).toBe(200);
    expect((await response.json()).data).toEqual({ wines: 3, units: 14 });
    await expect(dialog).toBeHidden();

    const counts = await Promise.all(productIds.map((id) => inStockByCellar(api, id)));
    expect(counts).toEqual([{ [kitchen]: 6 }, { [kitchen]: 5 }, { [kitchen]: 3 }]);
    // c4: the drunk bottle is not moved.
    const drunk = (await detail(api, a.productId)).items.find(isGone);
    expect(drunk?.cellarId).toBe(garage);

    await problems.dump();
    expect(problems.get(), problems.get().join('\n')).toEqual([]);
  });

  test('a group moved next to the identical group of the destination joins it', async ({ page }) => {
    const api = page.request;
    const garage = await createCellar(api, 'Garage');
    const kitchen = await createCellar(api, 'Cuisine');
    const wine = await addWine(api, `E2E P Join ${stamp()}`, 2, garage);
    families.push(wine.productId);
    // Same wine, same price, same day, already in the kitchen.
    await okData(await api.post(`/api/products/${wine.productId}/items`, { data: { quantity: 4, cellarId: kitchen, purchasePrice: 20 } }));

    await okData(await api.post('/api/products/bulk-move', { data: { productIds: [wine.productId], cellarId: kitchen } }));

    const lines = (await detail(api, wine.productId)).items.filter((unit) => !unit.deletedAt && !isGone(unit));
    expect(lines.map((unit) => [unit.cellarId, unit.quantity])).toEqual([[kitchen, 6]]);
  });

  test('c2, c4: "Mettre à la corbeille" takes the 14 bottles out of the list; restoring them gives the 14 back', async ({ page }) => {
    const api = page.request;
    const garage = await createCellar(api, 'Garage');
    const { a, productIds } = await threeWines(api, garage, stamp());
    families.push(...productIds);

    const trashed = await okData<{ wines: number; units: number }>(await api.post('/api/products/bulk-trash', { data: { productIds } }));
    expect(trashed).toEqual({ wines: 3, units: 14 });

    // The cards leave the list of wines in the cellar (B and C have nothing left at all).
    const list = await okData<Array<{ id: string; items: Unit[] }>>(await api.get('/api/products'));
    for (const id of productIds) {
      const card = list.find((family) => family.id === id);
      expect(card?.items ?? []).toEqual([]);
    }
    // c4: the drunk bottle is not in the trash.
    expect((await detail(api, a.productId)).items.filter(isGone).every((unit) => unit.deletedAt === null)).toBe(true);

    // Restoring every line from the trash gives back the 14 bottles.
    const trash = await okData<Unit[]>(await api.get('/api/inventory/trash'));
    const ours = trash.filter((unit) => productIds.includes(unit.productId));
    for (const unit of ours) await okData(await api.post(`/api/inventory/${unit.id}/restore`));
    const counts = await Promise.all(productIds.map((id) => inStockByCellar(api, id)));
    expect(counts).toEqual([{ [garage]: 6 }, { [garage]: 5 }, { [garage]: 3 }]);
  });

  test('c3: "Marquer comme bus" asks for the wine of 6 (1 by default): 5 left, the wine of one has none', async ({ page }, testInfo) => {
    const problems = collectPageProblems(page, testInfo);
    const api = page.request;
    const label = stamp();
    const garage = await createCellar(api, 'Garage');
    const six = await addWine(api, `E2E P ${label} Six`, 6, garage);
    const one = await addWine(api, `E2E P ${label} One`, 1, garage);
    families.push(six.productId, one.productId);

    await page.goto(`/bottles?q=${encodeURIComponent(`E2E P ${label}`)}`);
    await page.getByRole('button', { name: 'Vue en liste' }).click();
    const rows = page.getByRole('row').filter({ hasText: `E2E P ${label}` });
    await expect(rows).toHaveCount(2);
    await page.getByRole('button', { name: 'Sélectionner', exact: true }).click();
    await rows.nth(0).getByText(`E2E P ${label}`).click();
    await rows.nth(1).getByText(`E2E P ${label}`).click();

    await page.getByTestId('bulk-actions-menu').click();
    await page.locator('[role="menuitem"]').filter({ hasText: 'Marquer comme bus' }).click();
    const dialog = page.getByTestId('bulk-wines-dialog');
    await expect(dialog.getByTestId('bulk-wines-summary')).toHaveText('2 vins, 7 bouteilles');
    // Asked for the wine of 6 only, 1 by default.
    await expect(dialog.getByTestId(`bulk-drink-count-${six.productId}`)).toHaveValue('1');
    await expect(dialog.getByTestId(`bulk-drink-count-${one.productId}`)).toHaveCount(0);
    const drunk = page.waitForResponse((r) => r.url().endsWith('/api/products/bulk-drink') && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Marquer comme bus', exact: true }).click();
    expect((await drunk).status()).toBe(200);
    await expect(dialog).toBeHidden();

    expect(await inStockByCellar(api, six.productId)).toEqual({ [garage]: 5 });
    expect(await inStockByCellar(api, one.productId)).toEqual({});
    // The bottle drunk is detached from the group: still in the spending, in "Déjà bues".
    const finished = (await detail(api, six.productId)).items.filter(isGone);
    expect(finished).toHaveLength(1);
    expect(finished[0].parentItemId).toBe(six.id);

    await problems.dump();
    expect(problems.get(), problems.get().join('\n')).toEqual([]);
  });

  test('more than a wine has is refused and nothing is written; a bulk edit cannot write a state (D18)', async ({ page }) => {
    const api = page.request;
    const garage = await createCellar(api, 'Garage');
    const a = await addWine(api, `E2E P Refuse ${stamp()}`, 2, garage);
    const b = await addWine(api, `E2E P Refuse ${stamp()}`, 2, garage);
    families.push(a.productId, b.productId);

    const res = await api.post('/api/products/bulk-drink', {
      data: { items: [{ productId: a.productId, count: 1 }, { productId: b.productId, count: 3 }] },
    });
    expect(res.status(), await res.text()).toBe(400);
    expect((await res.json()).error).toBe('COUNT_ABOVE_STOCK');
    expect(await inStockByCellar(api, a.productId)).toEqual({ [garage]: 2 });

    const bulkState = await api.post('/api/inventory/bulk', { data: { ids: [a.id], patch: { isOpened: true, fillLevel: 0 } } });
    expect(bulkState.status()).toBe(400);
    const preset = await api.post('/api/bulk-presets', { data: { name: `E2E P ${stamp()}`, payload: { fillLevel: 100 } } });
    expect(preset.status()).toBe(400);
  });
});
