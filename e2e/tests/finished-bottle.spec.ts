import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * #573: a finished bottle (opened, `fillLevel` 0) stays in the inventory for
 * its history, but the instance no longer holds it — so it must leave every
 * "what is in the cellar" figure: peak alerts, drink suggestions, the cellar
 * map, the counters and the inventory count, and give its grid slot back.
 *
 * Run here rather than in `api/tests/integration/` because those mock
 * Prisma: the bug lived in the SQL filters themselves (`NOT` over a nullable
 * `fillLevel`), which only a real PostgreSQL exercises. API-level only, on a
 * cellar created for each test so the counts are isolated.
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

const year = new Date().getFullYear();
// A window holding "now" on either side of New Year, whatever the API's clock.
const AT_PEAK = { peakMaturityFrom: year - 1, peakMaturityTo: year + 1 };

type Row = { id: string };
const ids = (rows: Row[]) => rows.map((r) => r.id);

/** Asserts a 2xx and returns the `{ data }` envelope's content. */
async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

async function createCellar(api: APIRequestContext, label: string): Promise<string> {
  const cellar = await okData<Row>(
    await api.post('/api/cellars', { data: { name: `E2E #573 ${label} ${stamp()}`, columns: 3, rows: 3 } }),
  );
  return cellar.id;
}

async function createItem(api: APIRequestContext, data: Record<string, unknown>): Promise<string> {
  const item = await okData<Row>(await api.post('/api/inventory', { data }));
  expect(item.id).toBeTruthy();
  return item.id;
}

async function closeCountSession(api: APIRequestContext, sessionId: string): Promise<APIResponse> {
  return api.post(`/api/inventory-count/sessions/${sessionId}/complete`, { data: { corrections: [] } });
}

/**
 * Only one count session may be active or paused instance-wide (409
 * SESSION_ALREADY_IN_PROGRESS). Someone else's count is never closed from
 * here — on a real instance that would end a count in progress — so the test
 * is skipped instead. CI starts from an empty database.
 */
async function startCountSession(api: APIRequestContext, cellarId: string, scopeLabel: string): Promise<string> {
  const res = await api.post('/api/inventory-count/sessions', { data: { scopeLabel, cellarId } });
  test.skip(res.status() === 409, 'another inventory count is already in progress on this instance');
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()).data as Row).id;
}

type CountReport = {
  missing: Row[];
  confirmed: Row[];
  counts: { expected: number; confirmed: number; missing: number; unexpected: number };
};

test('a finished bottle leaves alerts, suggestions, the map and the counters', async ({ page }) => {
  const api = page.request;
  const id = stamp();
  const itemIds: string[] = [];
  let cellarId = '';
  try {
    const before = await okData<{ bottles: number }>(await api.get('/api/stats/counts'));

    cellarId = await createCellar(api, 'map');
    const wine = (label: string, extra: Record<string, unknown>) => ({
      category: 'wine', name: `E2E #573 ${label} ${id}`, producer: 'E2E Domaine', cellarId, ...AT_PEAK, ...extra,
    });

    // (a) A full bottle on the shelf, at its peak.
    const full = await createItem(api, wine('Full', { estimatedValue: 30 }));
    itemIds.push(full);
    await okData(await api.patch(`/api/inventory/${full}`, { data: { slotColumn: 1, slotRow: 1 } }));

    // (b) Opened, level never entered (`fillLevel` null): still in stock — the
    // null-safety case of the "not finished" filter.
    const opened = await createItem(api, wine('Opened', { isOpened: true, estimatedValue: 20 }));
    itemIds.push(opened);

    // (c) On the shelf, then finished the way the tasting "bottle finished"
    // choice does it.
    const finished = await createItem(api, wine('Finished', { estimatedValue: 100 }));
    itemIds.push(finished);
    await okData(await api.patch(`/api/inventory/${finished}`, { data: { slotColumn: 2, slotRow: 1 } }));
    await okData(await api.patch(`/api/inventory/${finished}`, { data: { isOpened: true, fillLevel: 0 } }));

    // It stays in the inventory, but has left its rack.
    expect(await okData<Record<string, unknown>>(await api.get(`/api/inventory/${finished}`))).toMatchObject({
      isOpened: true, fillLevel: 0, slotColumn: null, slotRow: null,
    });

    // Sidebar counter: only the two bottles in stock were added.
    const after = await okData<{ bottles: number }>(await api.get('/api/stats/counts'));
    expect(after.bottles).toBe(before.bottles + 2);

    // Peak alerts.
    const alerts = ids(await okData<Row[]>(await api.get('/api/alerts')));
    expect(alerts).toEqual(expect.arrayContaining([full, opened]));
    expect(alerts).not.toContain(finished);

    // Drink suggestions, whatever the reason (peak window or opened).
    const suggestions = ids(await okData<Row[]>(await api.get('/api/consumption-plan/suggestions?limit=50')));
    expect(suggestions).toEqual(expect.arrayContaining([full, opened]));
    expect(suggestions).not.toContain(finished);

    // Cellar map.
    const grid = await okData<{ items: Row[] }>(await api.get(`/api/cellars/${cellarId}/grid`));
    expect(ids(grid.items).sort()).toEqual([full, opened].sort());

    // Cellar card: count and value of what is in stock.
    const cellar = await okData<{ stats: { totalItems: number; estimatedValue: number | null } }>(
      await api.get(`/api/cellars/${cellarId}`),
    );
    expect(cellar.stats.totalItems).toBe(2);
    expect(cellar.stats.estimatedValue).toBe(50);

    // The freed slot takes another bottle (no 409 SLOT_OCCUPIED).
    const moved = await api.patch(`/api/inventory/${opened}`, { data: { slotColumn: 2, slotRow: 1 } });
    expect(moved.status(), await moved.text()).toBe(200);
    expect((await moved.json()).data).toMatchObject({ slotColumn: 2, slotRow: 1 });
  } finally {
    for (const itemId of itemIds) await api.delete(`/api/inventory/${itemId}`).catch(() => {});
    if (cellarId) await api.delete(`/api/cellars/${cellarId}`).catch(() => {});
  }
});

test('a bottle marked consumed at a count is not missing at the next count', async ({ page }) => {
  const api = page.request;
  const id = stamp();
  const itemIds: string[] = [];
  const openSessions = new Set<string>();
  let cellarId = '';
  try {
    cellarId = await createCellar(api, 'count');
    const gone = await createItem(api, { category: 'wine', name: `E2E #573 Gone ${id}`, producer: 'E2E Domaine', cellarId });
    itemIds.push(gone);
    await okData(await api.patch(`/api/inventory/${gone}`, { data: { slotColumn: 1, slotRow: 1 } }));
    const there = await createItem(api, { category: 'wine', name: `E2E #573 There ${id}`, producer: 'E2E Domaine', cellarId });
    itemIds.push(there);

    // First count: only `there` is found, `gone` is marked consumed at closure.
    const first = await startCountSession(api, cellarId, `E2E #573 first ${id}`);
    openSessions.add(first);
    await okData(await api.post(`/api/inventory-count/sessions/${first}/scan`, { data: { itemId: there } }));
    const firstReport = await okData<CountReport>(await api.get(`/api/inventory-count/sessions/${first}/report`));
    expect(firstReport.counts.expected).toBe(2);
    expect(ids(firstReport.missing)).toEqual([gone]);

    const closed = await okData<{ appliedCount: number }>(
      await api.post(`/api/inventory-count/sessions/${first}/complete`, {
        data: { corrections: [{ action: 'mark_consumed', itemId: gone }] },
      }),
    );
    openSessions.delete(first);
    expect(closed.appliedCount).toBe(1);

    // The consumed bottle is finished and gave its slot back.
    expect(await okData<Record<string, unknown>>(await api.get(`/api/inventory/${gone}`))).toMatchObject({
      isOpened: true, fillLevel: 0, slotColumn: null, slotRow: null,
    });

    // Second count: it is no longer expected, so no longer missing.
    const second = await startCountSession(api, cellarId, `E2E #573 second ${id}`);
    openSessions.add(second);
    const secondReport = await okData<CountReport>(await api.get(`/api/inventory-count/sessions/${second}/report`));
    expect(secondReport.counts.expected).toBe(firstReport.counts.expected - 1);
    expect(ids(secondReport.missing)).toEqual([there]);
  } finally {
    // Never leave a session open: it would block every later count.
    for (const sessionId of openSessions) await closeCountSession(api, sessionId).catch(() => {});
    for (const itemId of itemIds) await api.delete(`/api/inventory/${itemId}`).catch(() => {});
    if (cellarId) await api.delete(`/api/cellars/${cellarId}`).catch(() => {});
  }
});

// #471 (FEAT-103): a group never carries a state — drinking one bottle of a
// shelved group detaches a finished bottle, and the group keeps its slot.
test('drinking one bottle of a shelved group leaves the others on the shelf', async ({ page }) => {
  const api = page.request;
  const id = stamp();
  let cellarId = '';
  let productId = '';
  try {
    cellarId = await createCellar(api, 'group');
    const group = await createItem(api, { category: 'wine', name: `E2E #471 Shelf ${id}`, producer: 'E2E Domaine', cellarId, estimatedValue: 30 });
    productId = (await okData<{ productId: string }>(await api.get(`/api/inventory/${group}`))).productId;
    await okData(await api.patch(`/api/inventory/${group}`, { data: { quantity: 3, slotColumn: 1, slotRow: 1 } }));

    const drunk = await okData<Row & Record<string, unknown>>(
      await api.patch(`/api/inventory/${group}`, { data: { isOpened: true, fillLevel: 0 } }),
    );

    expect(drunk).toMatchObject({ isOpened: true, fillLevel: 0, quantity: 1, parentItemId: group, slotColumn: null });
    expect(await okData<Record<string, unknown>>(await api.get(`/api/inventory/${group}`))).toMatchObject({
      quantity: 2, isOpened: false, slotColumn: 1, slotRow: 1,
    });
    const grid = await okData<{ items: Row[] }>(await api.get(`/api/cellars/${cellarId}/grid`));
    expect(ids(grid.items)).toEqual([group]);
    const cellar = await okData<{ stats: { totalItems: number; estimatedValue: number | null } }>(
      await api.get(`/api/cellars/${cellarId}`),
    );
    expect(cellar.stats).toMatchObject({ totalItems: 2, estimatedValue: 60 });
  } finally {
    if (productId) await api.delete(`/api/products/${productId}`).catch(() => {});
    if (cellarId) await api.delete(`/api/cellars/${cellarId}`).catch(() => {});
  }
});

// #471 (FEAT-103): "mark as consumed" on a missing group finishes each of its
// bottles (a finished sub-record each, the last one the group itself), so the
// spending keeps them all and none is missing at the next count.
test('a group missing at a count is drunk bottle by bottle and not missing at the next count', async ({ page }) => {
  const api = page.request;
  const id = stamp();
  const openSessions = new Set<string>();
  const families: string[] = [];
  let cellarId = '';
  try {
    cellarId = await createCellar(api, 'group-count');
    const gone = await createItem(api, { category: 'wine', name: `E2E #471 Gone ${id}`, producer: 'E2E Domaine', cellarId });
    await okData(await api.patch(`/api/inventory/${gone}`, { data: { quantity: 3 } }));
    const there = await createItem(api, { category: 'wine', name: `E2E #471 There ${id}`, producer: 'E2E Domaine', cellarId });
    for (const itemId of [gone, there]) {
      families.push((await okData<{ productId: string }>(await api.get(`/api/inventory/${itemId}`))).productId);
    }

    const first = await startCountSession(api, cellarId, `E2E #471 first ${id}`);
    openSessions.add(first);
    await okData(await api.post(`/api/inventory-count/sessions/${first}/scan`, { data: { itemId: there } }));
    const closed = await okData<{ appliedCount: number }>(
      await api.post(`/api/inventory-count/sessions/${first}/complete`, {
        data: { corrections: [{ action: 'mark_consumed', itemId: gone }] },
      }),
    );
    openSessions.delete(first);
    expect(closed.appliedCount).toBe(1);

    const detail = await okData<{ items: Array<Row & Record<string, unknown>> }>(await api.get(`/api/products/${families[0]}`));
    expect(detail.items).toHaveLength(3);
    for (const item of detail.items) expect(item).toMatchObject({ quantity: 1, isOpened: true, fillLevel: 0 });

    const second = await startCountSession(api, cellarId, `E2E #471 second ${id}`);
    openSessions.add(second);
    const report = await okData<CountReport>(await api.get(`/api/inventory-count/sessions/${second}/report`));
    expect(ids(report.missing)).toEqual([there]);
  } finally {
    for (const sessionId of openSessions) await closeCountSession(api, sessionId).catch(() => {});
    for (const productId of families) await api.delete(`/api/products/${productId}`).catch(() => {});
    if (cellarId) await api.delete(`/api/cellars/${cellarId}`).catch(() => {});
  }
});
