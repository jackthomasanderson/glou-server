import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * #471 (FEAT-96): every number Glou shows counts bottles and cigars in stock —
 * a row of the inventory is a group of N copies — and values them with one
 * rule (#594: estimated value, else purchase price, per copy). Spending keeps
 * every copy bought, drunk ones included, on its purchase day.
 *
 * API-level, on a real PostgreSQL: the counts read real rows through the
 * Prisma filters, which `api/tests/` (mocked Prisma) cannot exercise. Figures
 * shared by the whole instance (sidebar, budget) are compared before/after,
 * as other specs add bottles too.
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;
const year = new Date().getFullYear();
// A window holding "now" on either side of New Year, whatever the API's clock.
const AT_PEAK = { peakMaturityFrom: year - 1, peakMaturityTo: year + 1 };

type Row = { id: string };
type Counts = { bottles: number; cigars: number };
type CellarStats = { bottles: number; cigars: number; totalItems: number; estimatedValue: number | null };
type CavePoint = { cellarId: string; count: number; valuation: number };

/** Asserts a 2xx and returns the `{ data }` envelope's content. */
async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

async function createCellar(api: APIRequestContext, label: string): Promise<string> {
  return (await okData<Row>(await api.post('/api/cellars', { data: { name: `E2E #471 ${label} ${stamp()}` } }))).id;
}

/** Creates a bottle, then makes it a group of `quantity` copies. */
async function createGroup(
  api: APIRequestContext, quantity: number, data: Record<string, unknown>,
): Promise<string> {
  const { id } = await okData<Row>(await api.post('/api/inventory', { data: { category: 'wine', producer: 'E2E Domaine', ...data } }));
  if (quantity !== 1) await okData(await api.patch(`/api/inventory/${id}`, { data: { quantity } }));
  return id;
}

test('a cellar of 9 bottles worth 215 € shows the same figures everywhere (FEAT-96 c1)', async ({ page }) => {
  const api = page.request;
  const id = stamp();
  const itemIds: string[] = [];
  let cellarId = '';
  try {
    const before = await okData<Counts>(await api.get('/api/stats/counts'));
    cellarId = await createCellar(api, 'c1');

    // ×6 at 20 €, no estimate; ×2 bought 30 €, estimated 40 €; one opened at 15 €.
    itemIds.push(await createGroup(api, 6, { name: `E2E c1 Six ${id}`, cellarId, purchasePrice: 20 }));
    itemIds.push(await createGroup(api, 2, { name: `E2E c1 Two ${id}`, cellarId, purchasePrice: 30, estimatedValue: 40 }));
    itemIds.push(await createGroup(api, 1, {
      name: `E2E c1 Opened ${id}`, cellarId, purchasePrice: 15, isOpened: true, fillLevel: 60,
    }));

    // The sidebar.
    const after = await okData<Counts>(await api.get('/api/stats/counts'));
    expect(after.bottles - before.bottles).toBe(9);
    expect(after.cigars).toBe(before.cigars);

    // The cellar's card, alone and in the list.
    const cellar = await okData<{ stats: CellarStats }>(await api.get(`/api/cellars/${cellarId}`));
    expect(cellar.stats).toMatchObject({ bottles: 9, cigars: 0, totalItems: 9, estimatedValue: 215 });
    const listed = (await okData<Array<Row & { stats: CellarStats }>>(await api.get('/api/cellars')))
      .find((c) => c.id === cellarId);
    expect(listed?.stats).toMatchObject({ bottles: 9, estimatedValue: 215 });

    // The analytics.
    const analytics = await okData<{ caveDistribution: CavePoint[] }>(await api.get('/api/analytics'));
    expect(analytics.caveDistribution.find((c) => c.cellarId === cellarId)).toMatchObject({ count: 9, valuation: 215 });
  } finally {
    for (const itemId of itemIds) await api.delete(`/api/inventory/${itemId}`).catch(() => {});
    if (cellarId) await api.delete(`/api/cellars/${cellarId}`).catch(() => {});
  }
});

// The API cannot yet put several groups in one family (A2), so the family here
// is a single group of 9; the 3-group case is covered by api/tests (alert and
// consumption-plan services).
test('a wine of 9 bottles at its peak is one alert and one suggestion (FEAT-96 c4)', async ({ page }) => {
  const api = page.request;
  const id = stamp();
  const itemIds: string[] = [];
  try {
    const wineId = await createGroup(api, 9, { name: `E2E c4 Peak ${id}`, ...AT_PEAK });
    itemIds.push(wineId);
    const { productId } = await okData<{ productId: string }>(await api.get(`/api/inventory/${wineId}`));

    const alerts = await okData<Array<Row & { productId: string }>>(await api.get('/api/alerts'));
    expect(alerts.filter((a) => a.productId === productId)).toEqual([
      expect.objectContaining({ id: wineId, productId }),
    ]);

    const suggestions = await okData<Array<Row & { productId: string }>>(
      await api.get('/api/consumption-plan/suggestions?limit=50'),
    );
    expect(suggestions.filter((s) => s.productId === productId)).toHaveLength(1);
  } finally {
    for (const itemId of itemIds) await api.delete(`/api/inventory/${itemId}`).catch(() => {});
  }
});

// The purchase day cannot yet be entered through the API (E1): it is today
// for a new bottle, and the "bought in January, recorded in March" case is
// covered by api/tests (budget service). Here: a finished bottle is out of the
// bottles and the value, but stays in the spending of its purchase period.
test('a finished bottle leaves the stock and the value, not the spending (FEAT-96 c5)', async ({ page }) => {
  const api = page.request;
  const id = stamp();
  const itemIds: string[] = [];
  const envelopeIds: string[] = [];
  let cellarId = '';
  try {
    // Bounds sent the way the web's budget panel sends them: `new Date('YYYY-MM-DD')`.
    const createEnvelope = async (periodStart: string, periodEnd: string) => {
      const envelope = await okData<Row>(await api.post('/api/wishlist/budget-envelopes', {
        data: { periodStart: new Date(periodStart).toISOString(), periodEnd: new Date(periodEnd).toISOString(), amount: 1000 },
      }));
      envelopeIds.push(envelope.id);
      return envelope.id;
    };
    const spent = async (envelopeId: string) =>
      (await okData<{ spent: number }>(await api.get(`/api/wishlist/budget-envelopes/${envelopeId}/progress`))).spent;

    // This month, and last year (nothing bought by this test).
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0');
    const thisMonth = await createEnvelope(`${now.getFullYear()}-${month}-01`, `${now.getFullYear()}-${month}-${lastDay}`);
    const lastYear = await createEnvelope(`${year - 1}-01-01`, `${year - 1}-12-31`);
    const spentBefore = await spent(thisMonth);
    const spentLastYear = await spent(lastYear);

    cellarId = await createCellar(api, 'c5');
    const group = await createGroup(api, 3, { name: `E2E c5 Three ${id}`, cellarId, purchasePrice: 20 });
    itemIds.push(group);
    const drunk = await createGroup(api, 1, { name: `E2E c5 Drunk ${id}`, cellarId, purchasePrice: 20 });
    itemIds.push(drunk);
    await okData(await api.patch(`/api/inventory/${drunk}`, { data: { isOpened: true, fillLevel: 0 } }));

    const cellar = await okData<{ stats: CellarStats }>(await api.get(`/api/cellars/${cellarId}`));
    expect(cellar.stats).toMatchObject({ bottles: 3, estimatedValue: 60 });

    // 3 × 20 € + the drunk bottle's 20 €, in this month's envelope only.
    expect(await spent(thisMonth) - spentBefore).toBe(80);
    expect(await spent(lastYear)).toBe(spentLastYear);
  } finally {
    for (const itemId of itemIds) await api.delete(`/api/inventory/${itemId}`).catch(() => {});
    if (cellarId) await api.delete(`/api/cellars/${cellarId}`).catch(() => {});
    for (const envelopeId of envelopeIds) await api.delete(`/api/wishlist/budget-envelopes/${envelopeId}`).catch(() => {});
  }
});
