import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * #471 (FEAT-92 c1-c3, FEAT-95 c4, FEAT-101 c3): adding bottles to a known
 * wine and correcting a group's number, on a real PostgreSQL — the group
 * identity (cellar, price, size, purchase day) compared on the stored rows,
 * and the write-off that leaves the stock but not the spending. API level
 * only: the web's "Ajouter des bouteilles" and "Corriger le nombre" come with
 * lot W3. Every check reads the rows back through the API after the write.
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

type Unit = {
  id: string; productId: string; cellarId: string | null; quantity: number | null; purchasePrice: number | null;
  purchasedAt: string | null; bottleSize: string | null; cigarsPerBox: number | null; updatedAt: string;
  isOpened: boolean; fillLevel: number | null; writtenOffAt: string | null; needsReview: boolean;
};
type Written = { data: Unit; changed: Unit[]; removedIds: string[] };
type Detail = {
  id: string; items: Unit[]; tastings: { id: string }[];
  history: { action: string; itemId: string | null; changes: { field: string; from: unknown; to: unknown }[] | null }[];
};
type CellarStats = { bottles: number; cigars: number; estimatedValue: number | null };

/** Asserts a 2xx and returns the `{ data }` envelope's content. */
async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

/** Asserts a 2xx and returns the whole body (stock writes answer `{ data, changed, removedIds }`). */
async function okBody<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()) as T;
}

async function createCellar(api: APIRequestContext, label: string): Promise<string> {
  return (await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E #471 A2 ${label} ${stamp()}` } }))).id;
}

const detail = async (api: APIRequestContext, productId: string) =>
  okData<Detail>(await api.get(`/api/products/${productId}`));
const cellarStats = async (api: APIRequestContext, cellarId: string) =>
  (await okData<{ stats: CellarStats }>(await api.get(`/api/cellars/${cellarId}`))).stats;
const addUnits = async (api: APIRequestContext, productId: string, data: Record<string, unknown>) =>
  api.post(`/api/products/${productId}/items`, { data });
const correct = async (api: APIRequestContext, itemId: string, data: Record<string, unknown>) =>
  api.post(`/api/inventory/${itemId}/correct`, { data });

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

test.describe('add bottles and correct a number (#471, A2)', () => {
  const families: string[] = [];
  const cellars: string[] = [];
  const envelopes: string[] = [];
  test.afterEach(async ({ page }) => {
    const api = page.request;
    for (const productId of families.splice(0)) await api.delete(`/api/products/${productId}`).catch(() => {});
    for (const cellarId of cellars.splice(0)) await api.delete(`/api/cellars/${cellarId}`).catch(() => {});
    for (const id of envelopes.splice(0)) await api.delete(`/api/wishlist/budget-envelopes/${id}`).catch(() => {});
  });

  // FEAT-92 c1-c2: one card, its groups told apart by cellar, purchase day and size.
  test('identical bottles complete their group; another day, cellar or size makes another line', async ({ page }) => {
    const api = page.request;
    const garage = await createCellar(api, 'Garage');
    const kitchen = await createCellar(api, 'Cuisine');
    cellars.push(garage, kitchen);
    const first = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'wine', name: `E2E #471 A2 Cuvée ${stamp()}`, producer: 'E2E Domaine', cellarId: garage, purchasePrice: 20 },
    }));
    families.push(first.productId);

    // c1: ×6 at 20 €, worth 120 €.
    const six = await okBody<Written>(await addUnits(api, first.productId, { quantity: 5, cellarId: garage, purchasePrice: 20 }));
    expect(six.data).toMatchObject({ id: first.id, quantity: 6 });
    expect(await cellarStats(api, garage)).toMatchObject({ bottles: 6, estimatedValue: 120 });

    // c2: the same day → ×7; another day → a second line ×1.
    const seven = await addUnits(api, first.productId, { quantity: 1, cellarId: garage, purchasePrice: 20 });
    expect(seven.status()).toBe(200);
    expect((await seven.json()).data).toMatchObject({ id: first.id, quantity: 7 });
    const otherDay = await addUnits(api, first.productId, { quantity: 1, cellarId: garage, purchasePrice: 20, purchasedAt: '2026-01-15' });
    expect(otherDay.status()).toBe(201);
    // Two bottles in the kitchen → a third line.
    await okBody(await addUnits(api, first.productId, { quantity: 2, cellarId: kitchen, purchasePrice: 20 }));

    const list = await okData<Array<{ id: string; items: Unit[] }>>(await api.get('/api/products'));
    const cards = list.filter((family) => family.id === first.productId);
    expect(cards).toHaveLength(1);
    expect(cards[0].items.reduce((sum, unit) => sum + (unit.quantity ?? 1), 0)).toBe(10);

    // A magnum is a group of its own in the same family.
    await okBody(await addUnits(api, first.productId, { quantity: 1, cellarId: garage, purchasePrice: 20, bottleSize: 'Magnum' }));
    const rows = (await detail(api, first.productId)).items;
    expect(rows.map((unit) => [unit.cellarId, unit.quantity, unit.purchasedAt === '2026-01-15', unit.bottleSize]).sort())
      .toEqual([
        [garage, 1, false, 'Magnum'],
        [garage, 1, true, null],
        [garage, 7, false, null],
        [kitchen, 2, false, null],
      ].sort());
    expect(new Set(rows.map((unit) => unit.productId))).toEqual(new Set([first.productId]));
  });

  // FEAT-92 c3, point 34: an input error leaves the spending; a write-off stays in it.
  test('an input error erases bottles from the spending, a write-off keeps them there', async ({ page }) => {
    const api = page.request;
    const cellarId = await createCellar(api, 'Correct');
    cellars.push(cellarId);
    const envelope = await monthEnvelope(api);
    envelopes.push(envelope.id);
    const spentBefore = await envelope.spent();

    const first = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'wine', name: `E2E #471 A2 Correct ${stamp()}`, producer: 'E2E Domaine', cellarId, purchasePrice: 20 },
    }));
    families.push(first.productId);
    const group = (await okBody<Written>(await addUnits(api, first.productId, { quantity: 6, cellarId, purchasePrice: 20 }))).data;
    expect(group.quantity).toBe(7);
    expect(await envelope.spent() - spentBefore).toBe(140);

    // ×7 → ×5, input error: 2 bottles and 40 € of spending gone.
    const fixed = await okBody<Written>(await correct(api, group.id, { quantity: 5, reason: 'input_error', expectedUpdatedAt: group.updatedAt }));
    expect(fixed).toMatchObject({ data: { id: group.id, quantity: 5 }, changed: [] });
    expect(await cellarStats(api, cellarId)).toMatchObject({ bottles: 5, estimatedValue: 100 });
    expect(await envelope.spent() - spentBefore).toBe(100);

    // The client's copy is now stale: the replay is a conflict, never applied twice.
    const replay = await correct(api, group.id, { quantity: 5, reason: 'input_error', expectedUpdatedAt: group.updatedAt });
    expect(replay.status()).toBe(409);
    expect((await replay.json()).data).toMatchObject({ id: group.id, quantity: 5 });

    // ×5 → ×3, broken / given away / lost: out of the stock and the value, not the spending.
    const written = await okBody<Written>(await correct(api, group.id, { quantity: 3, reason: 'written_off' }));
    expect(written.data).toMatchObject({ quantity: 2, writtenOffAt: expect.any(String), cellarId, purchasePrice: 20 });
    expect(written.changed).toEqual([expect.objectContaining({ id: group.id, quantity: 3 })]);
    expect(await cellarStats(api, cellarId)).toMatchObject({ bottles: 3, estimatedValue: 60 });
    expect(await envelope.spent() - spentBefore).toBe(100);

    // The family keeps the two bottles written off, and the history tells both corrections.
    const family = await detail(api, first.productId);
    expect(family.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: group.id, quantity: 3, writtenOffAt: null }),
      expect.objectContaining({ id: written.data.id, quantity: 2, writtenOffAt: expect.any(String) }),
    ]));
    expect(family.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'CORRECT_QUANTITY', itemId: group.id, changes: [{ field: 'quantity', from: 7, to: 5 }] }),
      expect.objectContaining({ action: 'CORRECT_QUANTITY', itemId: group.id, changes: [{ field: 'quantity', from: 5, to: 3 }] }),
      expect.objectContaining({ action: 'ADD_UNITS', itemId: group.id, changes: [{ field: 'quantity', from: 1, to: 7 }] }),
    ]));

    // Never below 1 by input error; the whole group may leave as a write-off.
    const zero = await correct(api, group.id, { quantity: 0, reason: 'input_error' });
    expect(zero.status()).toBe(400);
    expect((await zero.json()).error).toBe('QUANTITY_BELOW_ONE');
    const gone = await okBody<Written>(await correct(api, group.id, { quantity: 0, reason: 'written_off' }));
    expect(gone.data).toMatchObject({ id: group.id, quantity: 3, writtenOffAt: expect.any(String) });
    expect(await cellarStats(api, cellarId)).toMatchObject({ bottles: 0 });
    expect(await envelope.spent() - spentBefore).toBe(100);
    // A write-off has no number left to correct.
    expect((await correct(api, group.id, { quantity: 1, reason: 'input_error' })).status()).toBe(409);
  });

  // FEAT-95 c4: correcting boxes counts cigars, and smokes none.
  test('3 boxes of 25 corrected to 2 take 25 cigars off, none smoked', async ({ page }) => {
    const api = page.request;
    const cellarId = await createCellar(api, 'Humidor');
    cellars.push(cellarId);
    const single = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'cigar', name: `E2E #471 A2 Robusto ${stamp()}`, producer: 'E2E Habano', format: 'Robusto', quantity: 1, cellarId },
    }));
    families.push(single.productId);

    const boxes = await okBody<Written>(await addUnits(api, single.productId, { quantity: 3, cigarsPerBox: 25, cellarId, purchasePrice: 200 }));
    expect(boxes.data).toMatchObject({ quantity: 3, cigarsPerBox: 25 });
    expect(await cellarStats(api, cellarId)).toMatchObject({ cigars: 76, bottles: 0 });

    await okBody(await correct(api, boxes.data.id, { quantity: 2, reason: 'input_error' }));
    expect(await cellarStats(api, cellarId)).toMatchObject({ cigars: 51 });
    const family = await detail(api, single.productId);
    expect(family.items.filter((unit) => unit.isOpened || unit.writtenOffAt)).toEqual([]);

    // A box size is for cigars only.
    const bottles = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'wine', name: `E2E #471 A2 Not a box ${stamp()}`, producer: 'E2E Domaine' },
    }));
    families.push(bottles.productId);
    expect((await addUnits(api, bottles.productId, { quantity: 1, cigarsPerBox: 25 })).status()).toBe(400);
  });

  // FEAT-101 c3: a wine known without bottle comes back in stock, its tastings intact.
  test('adding bottles to a wine drunk to the last brings it back, a wine in the trash is refused', async ({ page }) => {
    const api = page.request;
    const drunk = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'wine', name: `E2E #471 A2 Known ${stamp()}`, producer: 'E2E Domaine', purchasePrice: 20 },
    }));
    families.push(drunk.productId);
    const tasting = await okData<{ id: string }>(await api.post('/api/tastings', { data: { itemId: drunk.id, rating: 4 } }));
    await okData(await api.patch(`/api/inventory/${drunk.id}`, { data: { isOpened: true, fillLevel: 0 } }));
    const listed = async () => (await okData<Array<{ id: string; items: Unit[] }>>(await api.get('/api/products')))
      .find((family) => family.id === drunk.productId);
    expect(await listed()).toMatchObject({ items: [] });

    const back = await okBody<Written>(await addUnits(api, drunk.productId, { quantity: 3, purchasePrice: 20 }));
    expect(back.data.id).not.toBe(drunk.id);
    expect((await listed())?.items).toEqual([expect.objectContaining({ id: back.data.id, quantity: 3 })]);
    expect((await detail(api, drunk.productId)).tastings.map((t) => t.id)).toEqual([tasting.id]);

    await okData(await api.delete(`/api/products/${drunk.productId}`));
    const refused = await addUnits(api, drunk.productId, { quantity: 1 });
    expect(refused.status()).toBe(409);
    expect((await refused.json()).error).toBe('PRODUCT_IN_TRASH');
    expect((await addUnits(api, '00000000-0000-4000-8000-000000000000', { quantity: 1 })).status()).toBe(404);
  });
});
