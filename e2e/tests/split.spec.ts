import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * #471 (FEAT-98 c1-c5): moving part of a group to another cellar, changing
 * the price of part of a group, on a real PostgreSQL. API level only: the
 * web's "Déplacer" and "Changer le prix" dialogs come with lot W3. Every
 * check reads the rows back through the API after the write — the family's
 * lines, each cellar's count and value, the month's spending, the history.
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

type Unit = {
  id: string; productId: string; cellarId: string | null; quantity: number | null; purchasePrice: number | null;
  purchasedAt: string | null; updatedAt: string; isOpened: boolean; fillLevel: number | null; writtenOffAt: string | null;
  slotColumn: number | null; slotRow: number | null;
};
type Written = { data: Unit; changed: Unit[]; removedIds: string[] };
type Detail = {
  id: string; items: Unit[];
  history: { action: string; itemId: string | null; changes: { field: string; from: unknown; to: unknown }[] | null }[];
};
type CellarStats = { bottles: number; estimatedValue: number | null };

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

async function okBody<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()) as T;
}

async function refused(res: APIResponse, status: number, code: string): Promise<void> {
  expect(res.status(), await res.text()).toBe(status);
  expect((await res.json()).error).toBe(code);
}

async function createCellar(api: APIRequestContext, label: string): Promise<string> {
  return (await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E #471 G ${label} ${stamp()}` } }))).id;
}

const detail = async (api: APIRequestContext, productId: string) => okData<Detail>(await api.get(`/api/products/${productId}`));
const cellarStats = async (api: APIRequestContext, cellarId: string) =>
  (await okData<{ stats: CellarStats }>(await api.get(`/api/cellars/${cellarId}`))).stats;
const move = (api: APIRequestContext, itemId: string, data: Record<string, unknown>) => api.post(`/api/inventory/${itemId}/move`, { data });
const reprice = (api: APIRequestContext, itemId: string, data: Record<string, unknown>) => api.post(`/api/inventory/${itemId}/reprice`, { data });

/** The lines in stock of a family, as [cellar, number, price], sorted. */
async function lines(api: APIRequestContext, productId: string): Promise<Array<[string | null, number | null, number | null]>> {
  return (await detail(api, productId)).items
    .filter((unit) => !unit.isOpened && !unit.writtenOffAt)
    .map((unit): [string | null, number | null, number | null] => [unit.cellarId, unit.quantity, unit.purchasePrice])
    .sort();
}

/** The family's card in the list: its number of bottles in stock. */
async function cardBottles(api: APIRequestContext, productId: string): Promise<number> {
  const list = await okData<Array<{ id: string; items: Unit[] }>>(await api.get('/api/products'));
  const card = list.find((family) => family.id === productId);
  return (card?.items ?? []).filter((unit) => !unit.isOpened).reduce((sum, unit) => sum + (unit.quantity ?? 1), 0);
}

/** A budget envelope over the current month, and how much it has spent. */
async function monthEnvelope(api: APIRequestContext): Promise<{ id: string; spent: () => Promise<number> }> {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0');
  const { id } = await okData<{ id: string }>(await api.post('/api/wishlist/budget-envelopes', {
    data: {
      periodStart: new Date(`${now.getFullYear()}-${month}-01`).toISOString(),
      periodEnd: new Date(`${now.getFullYear()}-${month}-${lastDay}`).toISOString(),
      amount: 1000,
    },
  }));
  return {
    id,
    spent: async () => (await okData<{ spent: number }>(await api.get(`/api/wishlist/budget-envelopes/${id}/progress`))).spent,
  };
}

test.describe('move or reprice part of a group (#471, FEAT-98)', () => {
  const families: string[] = [];
  const cellars: string[] = [];
  const envelopes: string[] = [];
  test.afterEach(async ({ page }) => {
    const api = page.request;
    for (const productId of families.splice(0)) await api.delete(`/api/products/${productId}`).catch(() => {});
    for (const cellarId of cellars.splice(0)) await api.delete(`/api/cellars/${cellarId}`).catch(() => {});
    for (const id of envelopes.splice(0)) await api.delete(`/api/wishlist/budget-envelopes/${id}`).catch(() => {});
  });

  /** A wine of `count` bottles at `price` in `cellarId`: one group. */
  async function wineGroup(api: APIRequestContext, cellarId: string, count: number, price = 20): Promise<Unit> {
    const first = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'wine', name: `E2E #471 G Cuvée ${stamp()}`, producer: 'E2E Domaine', cellarId, purchasePrice: price },
    }));
    families.push(first.productId);
    if (count === 1) return first;
    const group = (await okBody<Written>(await api.post(`/api/products/${first.productId}/items`, {
      data: { quantity: count - 1, cellarId, purchasePrice: price },
    }))).data;
    expect(group).toMatchObject({ id: first.id, quantity: count });
    return group;
  }

  // c1, c2, c4: garage ×6 → garage ×4 + kitchen ×2, the card still 6 bottles.
  test('moving 2 of 6 bottles splits the group; the family and its spending do not change', async ({ page }) => {
    const api = page.request;
    const garage = await createCellar(api, 'Garage');
    const kitchen = await createCellar(api, 'Cuisine');
    cellars.push(garage, kitchen);
    const envelope = await monthEnvelope(api);
    envelopes.push(envelope.id);
    const spentBefore = await envelope.spent();
    const group = await wineGroup(api, garage, 6);
    expect(await envelope.spent() - spentBefore).toBe(120);

    // c4: never more than the group holds — nothing written.
    await refused(await move(api, group.id, { count: 7, cellarId: kitchen }), 400, 'COUNT_ABOVE_GROUP');
    await refused(await move(api, group.id, { count: 2, cellarId: garage }), 400, 'SAME_CELLAR');
    await refused(await move(api, group.id, { count: 2, cellarId: '00000000-0000-4000-8000-000000000000' }), 400, 'CELLAR_NOT_FOUND');
    expect(await lines(api, group.productId)).toEqual([[garage, 6, 20]]);

    // c1
    const moved = await okBody<Written>(await move(api, group.id, { count: 2, cellarId: kitchen, expectedUpdatedAt: group.updatedAt }));
    expect(moved.data).toMatchObject({ cellarId: kitchen, quantity: 2, purchasePrice: 20, purchasedAt: group.purchasedAt });
    expect(moved.data.id).not.toBe(group.id);
    expect(moved.changed).toEqual([expect.objectContaining({ id: group.id, cellarId: garage, quantity: 4 })]);
    expect(moved.removedIds).toEqual([]);
    expect(await lines(api, group.productId)).toEqual([[garage, 4, 20], [kitchen, 2, 20]].sort());
    expect(new Set((await detail(api, group.productId)).items.map((unit) => unit.productId))).toEqual(new Set([group.productId]));
    expect(await cardBottles(api, group.productId)).toBe(6);

    // c2: each cellar's count and value follow; the spending does not move.
    expect(await cellarStats(api, garage)).toMatchObject({ bottles: 4, estimatedValue: 80 });
    expect(await cellarStats(api, kitchen)).toMatchObject({ bottles: 2, estimatedValue: 40 });
    expect(await envelope.spent() - spentBefore).toBe(120);

    // The dialog left open on the old count is a conflict, never applied twice.
    const replay = await move(api, group.id, { count: 2, cellarId: kitchen, expectedUpdatedAt: group.updatedAt });
    expect(replay.status()).toBe(409);
    expect((await replay.json()).data).toMatchObject({ id: group.id, quantity: 4 });

    // Point 57: the move is told on both groups.
    const history = (await detail(api, group.productId)).history.filter((entry) => entry.action === 'MOVE_UNITS');
    expect(history).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: group.id, changes: [{ field: 'quantity', from: 6, to: 4 }] }),
      expect.objectContaining({
        itemId: moved.data.id,
        changes: [{ field: 'quantity', from: null, to: 2 }, { field: 'cellarId', from: garage, to: kitchen }],
      }),
    ]));

    // The rest of the group joins the identical kitchen line: one line of 6, the garage line is gone.
    const whole = await okBody<Written>(await move(api, group.id, { count: 4, cellarId: kitchen }));
    expect(whole).toMatchObject({ data: { id: moved.data.id, quantity: 6, cellarId: kitchen }, removedIds: [group.id] });
    expect(await lines(api, group.productId)).toEqual([[kitchen, 6, 20]]);
    expect(await cellarStats(api, garage)).toMatchObject({ bottles: 0 });
    expect(await cellarStats(api, kitchen)).toMatchObject({ bottles: 6, estimatedValue: 120 });
    expect(await envelope.spent() - spentBefore).toBe(120);
    // The history of the group that is gone stays with the family, on the line that took its bottles.
    expect((await detail(api, group.productId)).history.filter((entry) => entry.action === 'ADD_UNITS')[0])
      .toMatchObject({ itemId: moved.data.id });
  });

  // c3: the kitchen already holds an identical ×1 → ×3, no new line.
  test('moved bottles complete the identical group of the destination', async ({ page }) => {
    const api = page.request;
    const garage = await createCellar(api, 'Garage');
    const kitchen = await createCellar(api, 'Cuisine');
    cellars.push(garage, kitchen);
    const group = await wineGroup(api, garage, 6);
    const one = (await okBody<Written>(await api.post(`/api/products/${group.productId}/items`, {
      data: { quantity: 1, cellarId: kitchen, purchasePrice: 20 },
    }))).data;

    const moved = await okBody<Written>(await move(api, group.id, { count: 2, cellarId: kitchen }));

    expect(moved.data).toMatchObject({ id: one.id, quantity: 3 });
    expect(await lines(api, group.productId)).toEqual([[garage, 4, 20], [kitchen, 3, 20]].sort());
    expect(await cardBottles(api, group.productId)).toBe(7);
    expect(await cellarStats(api, kitchen)).toMatchObject({ bottles: 3, estimatedValue: 60 });
  });

  // An opened bottle is not a group; it stays with its group of origin.
  test('an opened bottle cannot be moved as a group, and stays behind when its group moves', async ({ page }) => {
    const api = page.request;
    const garage = await createCellar(api, 'Garage');
    const kitchen = await createCellar(api, 'Cuisine');
    cellars.push(garage, kitchen);
    const group = await wineGroup(api, garage, 4);
    const opened = await okBody<Written>(await api.patch(`/api/inventory/${group.id}`, { data: { isOpened: true, fillLevel: 60 } }));
    expect(opened.data.id).not.toBe(group.id);

    await refused(await move(api, opened.data.id, { count: 1, cellarId: kitchen }), 400, 'NOT_A_GROUP');

    await okBody(await move(api, group.id, { count: 1, cellarId: kitchen }));
    const items = (await detail(api, group.productId)).items;
    expect(items.find((unit) => unit.id === opened.data.id)).toMatchObject({ cellarId: garage, isOpened: true });
    expect(await lines(api, group.productId)).toEqual([[garage, 2, 20], [kitchen, 1, 20]].sort());

    // A wine in the trash: its bottles are gone with it.
    await okData(await api.delete(`/api/products/${group.productId}`));
    await refused(await move(api, group.id, { count: 1, cellarId: kitchen }), 404, 'ITEM_NOT_FOUND');
  });

  // c5: ×6 at 20 € → ×4 at 20 € + ×2 at 25 € in the same cellar; spending 120 € → 130 €.
  test('repricing 2 of 6 bottles splits the group in the same cellar; the spending follows', async ({ page }) => {
    const api = page.request;
    const garage = await createCellar(api, 'Garage');
    cellars.push(garage);
    const envelope = await monthEnvelope(api);
    envelopes.push(envelope.id);
    const spentBefore = await envelope.spent();
    const group = await wineGroup(api, garage, 6);
    expect(await envelope.spent() - spentBefore).toBe(120);

    await refused(await reprice(api, group.id, { count: 2, purchasePrice: 20 }), 400, 'SAME_PRICE');

    const repriced = await okBody<Written>(await reprice(api, group.id, { count: 2, purchasePrice: 25, expectedUpdatedAt: group.updatedAt }));
    expect(repriced.data).toMatchObject({ cellarId: garage, quantity: 2, purchasePrice: 25, purchasedAt: group.purchasedAt });
    expect(repriced.changed).toEqual([expect.objectContaining({ id: group.id, quantity: 4, purchasePrice: 20 })]);
    expect(await lines(api, group.productId)).toEqual([[garage, 2, 25], [garage, 4, 20]].sort());
    expect(await cardBottles(api, group.productId)).toBe(6);
    expect(await envelope.spent() - spentBefore).toBe(130);
    expect(await cellarStats(api, garage)).toMatchObject({ bottles: 6, estimatedValue: 130 });

    // Point 57: "prix de 2 bouteilles 20 € → 25 €".
    expect((await detail(api, group.productId)).history).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'REPRICE_UNITS', itemId: repriced.data.id,
        changes: [{ field: 'quantity', from: null, to: 2 }, { field: 'purchasePrice', from: 20, to: 25 }],
      }),
      expect.objectContaining({ action: 'REPRICE_UNITS', itemId: group.id, changes: [{ field: 'quantity', from: 6, to: 4 }] }),
    ]));

    // All of the rest at 25 €: it joins the 25 € line — one line of 6 at 25 €.
    const all = await okBody<Written>(await reprice(api, group.id, { count: 4, purchasePrice: 25 }));
    expect(all).toMatchObject({ data: { id: repriced.data.id, quantity: 6 }, removedIds: [group.id] });
    expect(await lines(api, group.productId)).toEqual([[garage, 6, 25]]);
    expect(await envelope.spent() - spentBefore).toBe(150);
  });
});
