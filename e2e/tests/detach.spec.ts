import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * #471 (FEAT-103, FEAT-106, D8): opening, drinking or smoking one copy of a
 * group detaches it as a sub-record; putting it back closed and full puts it
 * back into its group. API level, on a real PostgreSQL: the rule runs in one
 * transaction under the family lock, which `api/tests/` (mocked Prisma)
 * cannot exercise. Each test has its own cellar, so its figures are its own;
 * the spending is compared before/after on this month's budget envelope
 * (workers: 1, nothing else writes meanwhile).
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

type Row = { id: string };
type Unit = Row & {
  productId: string; quantity: number | null; isOpened: boolean; fillLevel: number | null;
  cigarsPerBox: number | null; cigarsLeft: number | null; parentItemId: string | null;
  cellarId: string | null; slotColumn: number | null; slotRow: number | null; updatedAt: string;
};
type Written = { data: Unit; changed: Unit[]; removedIds: string[] };
type Detail = { items: Unit[]; tastings: { id: string; itemId: string | null }[] };
type CellarStats = { bottles: number; cigars: number; estimatedValue: number | null };

/** Asserts a 2xx and returns the `{ data }` envelope's content. */
async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

/** A PATCH of a unit, answered with D8's `{ data, changed, removedIds }`. */
async function write(api: APIRequestContext, id: string, data: Record<string, unknown>): Promise<Written> {
  const res = await api.patch(`/api/inventory/${id}`, { data });
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()) as Written;
}

async function createCellar(api: APIRequestContext, label: string): Promise<string> {
  return (await okData<Row>(await api.post('/api/cellars', { data: { name: `E2E #471 detach ${label} ${stamp()}`, columns: 3, rows: 3 } }))).id;
}

/** Adds a unit, then makes it a group of `quantity` (POST cannot yet set a count for a wine, E1). */
async function createGroup(api: APIRequestContext, quantity: number, data: Record<string, unknown>): Promise<Unit> {
  const unit = await okData<Unit>(await api.post('/api/inventory', { data: { category: 'wine', producer: 'E2E Domaine', ...data } }));
  if (quantity === unit.quantity) return unit;
  return (await write(api, unit.id, { quantity })).data;
}

const units = async (api: APIRequestContext, productId: string) =>
  (await okData<Detail>(await api.get(`/api/products/${productId}`))).items;

const stats = async (api: APIRequestContext, cellarId: string) =>
  (await okData<{ stats: CellarStats }>(await api.get(`/api/cellars/${cellarId}`))).stats;

/** This month's spending, read through a budget envelope (FEAT-96 c5). */
async function spending(api: APIRequestContext, envelopes: string[]): Promise<() => Promise<number>> {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0');
  const envelope = await okData<Row>(await api.post('/api/wishlist/budget-envelopes', {
    data: {
      periodStart: new Date(`${now.getFullYear()}-${month}-01`).toISOString(),
      periodEnd: new Date(`${now.getFullYear()}-${month}-${lastDay}`).toISOString(),
      amount: 1000,
    },
  }));
  envelopes.push(envelope.id);
  return async () => (await okData<{ spent: number }>(await api.get(`/api/wishlist/budget-envelopes/${envelope.id}/progress`))).spent;
}

test.describe('detach and reattach (#471)', () => {
  let families: string[] = [];
  let cellars: string[] = [];
  let envelopes: string[] = [];
  test.afterEach(async ({ page }) => {
    const api = page.request;
    for (const productId of families) await api.delete(`/api/products/${productId}`).catch(() => {});
    for (const cellarId of cellars) await api.delete(`/api/cellars/${cellarId}`).catch(() => {});
    for (const envelopeId of envelopes) await api.delete(`/api/wishlist/budget-envelopes/${envelopeId}`).catch(() => {});
    families = [];
    cellars = [];
    envelopes = [];
  });

  /** A cellar and a group of `quantity` bottles at 20 € in it. */
  async function groupOf(api: APIRequestContext, quantity: number, extra: Record<string, unknown> = {}) {
    const cellarId = await createCellar(api, `x${quantity}`);
    cellars.push(cellarId);
    const group = await createGroup(api, quantity, { name: `E2E detach ${stamp()}`, cellarId, purchasePrice: 20, ...extra });
    families.push(group.productId);
    return { cellarId, group };
  }

  test('FEAT-103 c1: opening one bottle of a group of 6 leaves 5 full and 1 opened, still 6 bottles', async ({ page }) => {
    const api = page.request;
    const { cellarId, group } = await groupOf(api, 6);

    const opened = await write(api, group.id, { isOpened: true, fillLevel: 60 });

    expect(opened.data).toMatchObject({ isOpened: true, fillLevel: 60, quantity: 1, parentItemId: group.id, cellarId });
    expect(opened.data.id).not.toBe(group.id);
    expect(opened.changed).toEqual([expect.objectContaining({ id: group.id, quantity: 5, isOpened: false })]);
    expect(opened.removedIds).toEqual([]);
    const all = await units(api, group.productId);
    expect(all).toHaveLength(2);
    expect(all.find((unit) => unit.id === group.id)).toMatchObject({ quantity: 5, isOpened: false });
    expect((await stats(api, cellarId)).bottles).toBe(6);
  });

  test('FEAT-103 c2: drinking one bottle of a group of 6 at 20 € leaves 5 in stock, 120 € spent', async ({ page }) => {
    const api = page.request;
    const spent = await spending(api, envelopes);
    const before = await spent();
    const { cellarId, group } = await groupOf(api, 6);
    expect(await spent() - before).toBe(120);

    const drunk = await write(api, group.id, { isOpened: true, fillLevel: 0 });

    expect(drunk.data).toMatchObject({ isOpened: true, fillLevel: 0, quantity: 1, parentItemId: group.id });
    expect(await stats(api, cellarId)).toMatchObject({ bottles: 5, estimatedValue: 100 });
    // The finished bottle stays in the family's history.
    expect((await units(api, group.productId)).map((unit) => unit.id)).toContain(drunk.data.id);
    expect(await spent() - before).toBe(120);
  });

  test('FEAT-103 c3: opening the only bottle of a group of 1 creates nothing else', async ({ page }) => {
    const api = page.request;
    const { group } = await groupOf(api, 1);

    const opened = await write(api, group.id, { isOpened: true, fillLevel: 80 });

    expect(opened.data).toMatchObject({ id: group.id, isOpened: true, fillLevel: 80 });
    expect(opened.changed).toEqual([]);
    expect(await units(api, group.productId)).toHaveLength(1);
  });

  test('FEAT-103 c4: smoking a cigar of 3 closed boxes of 25 leaves 2 boxes and one of 24 — 75 → 74', async ({ page }) => {
    const api = page.request;
    const cellarId = await createCellar(api, 'boxes');
    cellars.push(cellarId);
    const box = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'cigar', name: `E2E detach box ${stamp()}`, producer: 'E2E Habanos', cellarId, quantity: 3, purchasePrice: 250 },
    }));
    families.push(box.productId);
    await write(api, box.id, { cigarsPerBox: 25 });
    expect((await stats(api, cellarId)).cigars).toBe(75);

    const smoked = await write(api, box.id, { smokeOne: true });

    expect(smoked.data).toMatchObject({ isOpened: true, cigarsLeft: 24, cigarsPerBox: 25, quantity: 1, parentItemId: box.id });
    expect(smoked.changed).toEqual([expect.objectContaining({ id: box.id, quantity: 2, isOpened: false, cigarsLeft: null })]);
    expect((await stats(api, cellarId)).cigars).toBe(74);

    // The next one comes out of the opened box.
    const next = await write(api, smoked.data.id, { smokeOne: true });
    expect(next.data).toMatchObject({ id: smoked.data.id, cigarsLeft: 23 });
    expect((await stats(api, cellarId)).cigars).toBe(73);
  });

  test('FEAT-103 c5: smoking one of 4 single cigars leaves 3 and one finished cigar', async ({ page }) => {
    const api = page.request;
    const cellarId = await createCellar(api, 'singles');
    cellars.push(cellarId);
    const spent = await spending(api, envelopes);
    const before = await spent();
    const singles = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'cigar', name: `E2E detach singles ${stamp()}`, producer: 'E2E Habanos', cellarId, quantity: 4, purchasePrice: 12 },
    }));
    families.push(singles.productId);

    const smoked = await write(api, singles.id, { smokeOne: true });

    expect(smoked.data).toMatchObject({ isOpened: true, fillLevel: 0, quantity: 1, parentItemId: singles.id });
    expect(smoked.changed).toEqual([expect.objectContaining({ id: singles.id, quantity: 3 })]);
    expect((await stats(api, cellarId)).cigars).toBe(3);
    expect(await spent() - before).toBe(48);
  });

  test('a bottle refuses to be smoked', async ({ page }) => {
    const api = page.request;
    const { group } = await groupOf(api, 2);
    const res = await api.patch(`/api/inventory/${group.id}`, { data: { smokeOne: true } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('NOT_A_CIGAR');
  });

  test('FEAT-106 c1: a bottle opened by mistake and put back full gives the group of 6 again', async ({ page }) => {
    const api = page.request;
    const { cellarId, group } = await groupOf(api, 6);
    const opened = await write(api, group.id, { isOpened: true, fillLevel: 60 });

    const back = await write(api, opened.data.id, { isOpened: false, fillLevel: 100 });

    expect(back.data).toMatchObject({ id: group.id, quantity: 6, isOpened: false });
    expect(back.removedIds).toEqual([opened.data.id]);
    expect((await api.get(`/api/inventory/${opened.data.id}`)).status()).toBe(404);
    expect(await units(api, group.productId)).toEqual([expect.objectContaining({ id: group.id, quantity: 6 })]);
    expect((await stats(api, cellarId)).bottles).toBe(6);
  });

  test('FEAT-106 c2: a tasting noted on the bottle is asked about, then kept on the family', async ({ page }) => {
    const api = page.request;
    const { group } = await groupOf(api, 6);
    const opened = await write(api, group.id, { isOpened: true, fillLevel: 60 });
    const tasting = await okData<Row>(await api.post('/api/tastings', { data: { itemId: opened.data.id, rating: 4 } }));

    const asked = await api.patch(`/api/inventory/${opened.data.id}`, { data: { isOpened: false, fillLevel: 100 } });
    expect(asked.status()).toBe(409);
    expect(await asked.json()).toMatchObject({ error: 'TASTINGS_ON_ITEM', details: { count: 1 } });
    expect(await units(api, group.productId)).toHaveLength(2);

    const back = await write(api, opened.data.id, { isOpened: false, fillLevel: 100, keepTastings: true });
    expect(back.data).toMatchObject({ id: group.id, quantity: 6 });
    const detail = await okData<Detail>(await api.get(`/api/products/${group.productId}`));
    expect(detail.tastings).toEqual([expect.objectContaining({ id: tasting.id, itemId: null })]);
  });

  test('FEAT-106 c3: when the group moved to another cellar, the bottle put back is a group of 1 in its own cellar', async ({ page }) => {
    const api = page.request;
    const { cellarId, group } = await groupOf(api, 6);
    const elsewhere = await createCellar(api, 'elsewhere');
    cellars.push(elsewhere);
    const opened = await write(api, group.id, { isOpened: true, fillLevel: 60 });
    await write(api, group.id, { cellarId: elsewhere });

    const back = await write(api, opened.data.id, { isOpened: false, fillLevel: 100 });

    expect(back.data).toMatchObject({ id: opened.data.id, quantity: 1, isOpened: false, parentItemId: null, cellarId });
    expect(back.removedIds).toEqual([]);
    expect((await stats(api, cellarId)).bottles).toBe(1);
    expect((await stats(api, elsewhere)).bottles).toBe(5);
  });

  test('FEAT-106 c4: a bottle marked drunk by mistake and put back full is counted again, spending unchanged', async ({ page }) => {
    const api = page.request;
    const spent = await spending(api, envelopes);
    const before = await spent();
    const { cellarId, group } = await groupOf(api, 6);
    const drunk = await write(api, group.id, { isOpened: true, fillLevel: 0 });
    expect((await stats(api, cellarId)).bottles).toBe(5);

    await write(api, drunk.data.id, { isOpened: false, fillLevel: 100 });

    expect((await stats(api, cellarId)).bottles).toBe(6);
    expect(await spent() - before).toBe(120);
  });

  test('an offline write replayed twice is a conflict the second time, never a second bottle', async ({ page }) => {
    const api = page.request;
    const { cellarId, group } = await groupOf(api, 6);
    const queued = { isOpened: true, fillLevel: 60, expectedUpdatedAt: group.updatedAt };

    const first = await write(api, group.id, queued);
    expect(first.changed[0]).toMatchObject({ id: group.id, quantity: 5 });

    const replay = await api.patch(`/api/inventory/${group.id}`, { data: queued });
    expect(replay.status()).toBe(409);
    expect((await replay.json()).error).toBe('CONFLICT');
    expect(await units(api, group.productId)).toHaveLength(2);
    expect((await stats(api, cellarId)).bottles).toBe(6);
  });

  test('the slot stays with the group when one of its bottles is opened', async ({ page }) => {
    const api = page.request;
    const { group } = await groupOf(api, 3);
    await write(api, group.id, { slotColumn: 1, slotRow: 1 });

    const opened = await write(api, group.id, { isOpened: true, fillLevel: 50 });

    expect(opened.data).toMatchObject({ slotColumn: null, slotRow: null });
    expect(opened.changed[0]).toMatchObject({ slotColumn: 1, slotRow: 1, quantity: 2 });
  });
});
