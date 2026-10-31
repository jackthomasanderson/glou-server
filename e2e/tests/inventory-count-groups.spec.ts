import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * #471 (FEAT-100 c1-c4): the rotating inventory counts a group in one answer
 * — "Combien en avez-vous trouvé ?" — on a real PostgreSQL: the missing or
 * surplus copies are corrected through the stock rules (finish, correct the
 * number, add), and a find of N bottles becomes a group ×N. API level; the
 * screens come with lot I2. One count session at a time instance-wide: each
 * test opens its own on a cellar of its own, and always closes it (afterEach).
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

type Unit = {
  id: string; productId: string; cellarId: string | null; quantity: number | null;
  isOpened: boolean; fillLevel: number | null; writtenOffAt: string | null;
};
type Line = { id: string; productId: string; isGroup: boolean; expectedQuantity: number; foundQuantity: number | null; missingQuantity: number; surplusQuantity: number };
type Find = { entryId: string; itemId: string | null; quantity: number | null; matchingProducts: { id: string }[] };
type Report = {
  expected: Line[]; confirmed: Line[]; missing: Line[]; surplus: Line[]; unexpected: Find[];
  counts: { expected: number; confirmed: number; missing: number; surplus: number; unexpected: number };
};
type Detail = {
  id: string; name: string; items: Unit[];
  history: { action: string; itemId: string | null; changes: { field: string; from: unknown; to: unknown }[] | null }[];
};
type CellarStats = { bottles: number; cigars: number; estimatedValue: number | null };

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

const detail = async (api: APIRequestContext, productId: string) => okData<Detail>(await api.get(`/api/products/${productId}`));
const cellarStats = async (api: APIRequestContext, cellarId: string) =>
  (await okData<{ stats: CellarStats }>(await api.get(`/api/cellars/${cellarId}`))).stats;
const report = async (api: APIRequestContext, sessionId: string) =>
  okData<Report>(await api.get(`/api/inventory-count/sessions/${sessionId}/report`));
const scan = async (api: APIRequestContext, sessionId: string, itemId: string, foundQuantity?: number) =>
  okData(await api.post(`/api/inventory-count/sessions/${sessionId}/scan`, { data: { itemId, foundQuantity } }));
const complete = async (api: APIRequestContext, sessionId: string, corrections: Record<string, unknown>[]) =>
  okData<{ appliedCount: number; skipped: unknown[] }>(await api.post(`/api/inventory-count/sessions/${sessionId}/complete`, { data: { corrections } }));

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

test.describe('rotating inventory by group (#471, FEAT-100)', () => {
  const families: string[] = [];
  const cellars: string[] = [];
  const envelopes: string[] = [];
  const sessions = new Set<string>();

  test.afterEach(async ({ page }) => {
    const api = page.request;
    // Never leave a session open: it would block every later count.
    for (const id of sessions) await api.post(`/api/inventory-count/sessions/${id}/complete`, { data: { corrections: [] } }).catch(() => {});
    sessions.clear();
    for (const productId of families.splice(0)) await api.delete(`/api/products/${productId}`).catch(() => {});
    for (const cellarId of cellars.splice(0)) await api.delete(`/api/cellars/${cellarId}`).catch(() => {});
    for (const id of envelopes.splice(0)) await api.delete(`/api/wishlist/budget-envelopes/${id}`).catch(() => {});
  });

  /** A cellar holding one group of `count` bottles at 20 €, and a count session open on it. */
  async function groupInCount(api: APIRequestContext, label: string, count: number) {
    const cellarId = (await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E #471 I1 ${label} ${stamp()}` } }))).id;
    cellars.push(cellarId);
    const first = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'wine', name: `E2E #471 I1 ${label} ${stamp()}`, producer: 'E2E Domaine', cellarId, purchasePrice: 20 },
    }));
    families.push(first.productId);
    if (count > 1) {
      await okData(await api.post(`/api/products/${first.productId}/items`, { data: { quantity: count - 1, cellarId, purchasePrice: 20 } }));
    }
    const start = await api.post('/api/inventory-count/sessions', { data: { scopeLabel: `E2E #471 I1 ${label}`, cellarId } });
    // CI starts from an empty database and every count spec closes its own:
    // a session still open here is a leak to fix, not a reason to skip.
    expect(start.status(), await start.text()).toBe(201);
    const sessionId = ((await start.json()).data as { id: string }).id;
    sessions.add(sessionId);
    return { cellarId, sessionId, groupId: first.id, productId: first.productId };
  }

  // c1: one line, "×6", one question.
  test('a group ×6 is a single line of the count, expecting 6', async ({ page }) => {
    const api = page.request;
    const { sessionId, groupId } = await groupInCount(api, 'Line', 6);

    const before = await report(api, sessionId);
    expect(before.expected).toEqual([expect.objectContaining({ id: groupId, isGroup: true, expectedQuantity: 6, foundQuantity: null, missingQuantity: 6 })]);
    expect(before.counts).toMatchObject({ expected: 6, confirmed: 0, missing: 6 });

    // One tap without number: the whole group was found.
    await scan(api, sessionId, groupId);
    expect((await report(api, sessionId)).counts).toMatchObject({ expected: 6, confirmed: 6, missing: 0 });
  });

  // c2: 4 found of 6 → corrections for 2; "broken / given away / lost" leaves ×4, none drunk, spending unchanged.
  test('answering 4 of 6 and correcting the number leaves ×4, none drunk, the spending unchanged', async ({ page }) => {
    const api = page.request;
    const envelope = await monthEnvelope(api);
    envelopes.push(envelope.id);
    const spentBefore = await envelope.spent();
    const { cellarId, sessionId, groupId, productId } = await groupInCount(api, 'Missing', 6);
    expect(await envelope.spent() - spentBefore).toBe(120);

    await scan(api, sessionId, groupId, 4);
    const counted = await report(api, sessionId);
    expect(counted.missing).toEqual([expect.objectContaining({ id: groupId, foundQuantity: 4, missingQuantity: 2 })]);
    expect(counted.counts).toMatchObject({ expected: 6, confirmed: 4, missing: 2 });

    const closed = await complete(api, sessionId, [{ action: 'correct_quantity', itemId: groupId, reason: 'written_off' }]);
    sessions.delete(sessionId);
    expect(closed).toMatchObject({ appliedCount: 1, skipped: [] });

    expect(await cellarStats(api, cellarId)).toMatchObject({ bottles: 4 });
    expect(await envelope.spent() - spentBefore).toBe(120);
    const family = await detail(api, productId);
    expect(family.items.filter((unit) => unit.isOpened || unit.fillLevel === 0)).toEqual([]);
    expect(family.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: groupId, quantity: 4, writtenOffAt: null }),
      expect.objectContaining({ quantity: 2, writtenOffAt: expect.any(String) }),
    ]));
    expect(family.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'CORRECT_QUANTITY', itemId: groupId, changes: [{ field: 'quantity', from: 6, to: 4 }] }),
    ]));
  });

  // c2, other choice: "Bues" detaches the 2 missing as finished bottles; the group's history says −2.
  test('answering 4 of 6 and marking them drunk leaves ×4 and 2 finished bottles', async ({ page }) => {
    const api = page.request;
    const { cellarId, sessionId, groupId, productId } = await groupInCount(api, 'Drunk', 6);

    await scan(api, sessionId, groupId, 4);
    await complete(api, sessionId, [{ action: 'mark_consumed', itemId: groupId }]);
    sessions.delete(sessionId);

    expect(await cellarStats(api, cellarId)).toMatchObject({ bottles: 4 });
    const family = await detail(api, productId);
    expect(family.items.find((unit) => unit.id === groupId)).toMatchObject({ quantity: 4, isOpened: false });
    expect(family.items.filter((unit) => unit.isOpened && unit.fillLevel === 0)).toHaveLength(2);
    expect(family.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'UPDATE', itemId: groupId, changes: [{ field: 'quantity', from: 6, to: 4 }] }),
    ]));
  });

  // c3: 8 found of 6 → add 2 → ×8.
  test('answering 8 of 6 and accepting the surplus makes the group ×8', async ({ page }) => {
    const api = page.request;
    const { cellarId, sessionId, groupId, productId } = await groupInCount(api, 'Surplus', 6);

    await scan(api, sessionId, groupId, 8);
    const counted = await report(api, sessionId);
    expect(counted.surplus).toEqual([expect.objectContaining({ id: groupId, surplusQuantity: 2 })]);
    expect(counted.missing).toEqual([]);

    await complete(api, sessionId, [{ action: 'add_units', itemId: groupId }]);
    sessions.delete(sessionId);

    expect(await cellarStats(api, cellarId)).toMatchObject({ bottles: 8 });
    const family = await detail(api, productId);
    expect(family.items.filter((unit) => !unit.writtenOffAt)).toEqual([expect.objectContaining({ id: groupId, quantity: 8 })]);
    expect(family.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'ADD_UNITS', itemId: groupId, changes: [{ field: 'quantity', from: 6, to: 8 }] }),
    ]));
  });

  // c4: a find of 6 bottles of an unknown wine → a new card with a group ×6, +6 in the counters.
  test('a find of 6 bottles of an unknown wine makes a new card ×6 and adds 6 bottles', async ({ page }) => {
    const api = page.request;
    const { sessionId } = await groupInCount(api, 'Find', 1);
    const name = `E2E #471 I1 Unknown ${stamp()}`;
    const before = (await okData<{ bottles: number }>(await api.get('/api/stats/counts'))).bottles;

    const { entryId } = await okData<{ entryId: string }>(await api.post(`/api/inventory-count/sessions/${sessionId}/found`, { data: { name, category: 'wine', quantity: 6 } }));
    expect((await report(api, sessionId)).unexpected).toEqual([expect.objectContaining({ entryId, itemId: null, quantity: 6, matchingProducts: [] })]);

    await complete(api, sessionId, [{ action: 'add_to_stock', entryId }]);
    sessions.delete(sessionId);

    expect((await okData<{ bottles: number }>(await api.get('/api/stats/counts'))).bottles).toBe(before + 6);
    const cards = (await okData<{ id: string; name: string; items: Unit[] }[]>(await api.get('/api/products'))).filter((family) => family.name === name);
    expect(cards).toHaveLength(1);
    families.push(cards[0].id);
    expect(cards[0].items).toEqual([expect.objectContaining({ quantity: 6 })]);
  });

  // c4, known wine: the find joins its family, never a second card.
  test('a find of a known wine joins its family', async ({ page }) => {
    const api = page.request;
    const { cellarId, sessionId, productId } = await groupInCount(api, 'Known', 2);
    const family = await detail(api, productId);
    const name = family.name;

    const { entryId } = await okData<{ entryId: string }>(await api.post(`/api/inventory-count/sessions/${sessionId}/found`, { data: { name: name.toUpperCase(), category: 'wine', quantity: 3 } }));
    expect((await report(api, sessionId)).unexpected[0].matchingProducts).toEqual([expect.objectContaining({ id: productId })]);

    await complete(api, sessionId, [{ action: 'add_to_stock', entryId, productId }]);
    sessions.delete(sessionId);

    expect(await cellarStats(api, cellarId)).toMatchObject({ bottles: 5 });
    const after = await detail(api, productId);
    expect(after.items.length).toBe(family.items.length + 1);
    expect((await okData<{ id: string; name: string }[]>(await api.get('/api/products'))).filter((card) => card.name === name)).toHaveLength(1);
  });

  // Review of #792: two finds of the same known wine, closed together.
  test('two finds of the same known wine both join it, in one group', async ({ page }) => {
    const api = page.request;
    const { cellarId, sessionId, productId } = await groupInCount(api, 'TwoFinds', 1);
    const name = (await detail(api, productId)).name;
    const find = async (label: string, quantity: number) =>
      (await okData<{ entryId: string }>(await api.post(`/api/inventory-count/sessions/${sessionId}/found`, { data: { name: label, category: 'wine', quantity } }))).entryId;
    const first = await find(name, 3);
    const second = await find(name.toLowerCase(), 2);

    const closed = await complete(api, sessionId, [
      { action: 'add_to_stock', entryId: first, productId },
      { action: 'add_to_stock', entryId: second, productId },
    ]);
    sessions.delete(sessionId);

    expect(closed).toMatchObject({ appliedCount: 2, skipped: [] });
    expect(await cellarStats(api, cellarId)).toMatchObject({ bottles: 6 });
    expect((await detail(api, productId)).items.filter((unit) => !unit.writtenOffAt).map((unit) => unit.quantity ?? 1).sort()).toEqual([1, 5]);
  });

  // Review of #792: a closure sent twice at once applies once.
  test('two closures sent at once apply the corrections once', async ({ page }) => {
    const api = page.request;
    const { cellarId, sessionId, groupId } = await groupInCount(api, 'Twice', 3);
    await scan(api, sessionId, groupId, 1);

    const send = () => api.post(`/api/inventory-count/sessions/${sessionId}/complete`, {
      data: { corrections: [{ action: 'correct_quantity', itemId: groupId, reason: 'input_error' }] },
    });
    const statuses = (await Promise.all([send(), send()])).map((res) => res.status()).sort();
    sessions.delete(sessionId);

    expect(statuses).toEqual([200, 409]);
    expect(await cellarStats(api, cellarId)).toMatchObject({ bottles: 1 });
  });
});
