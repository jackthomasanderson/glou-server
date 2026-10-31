import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * #471 (FEAT-102 c1-c5, API): "À vérifier après la mise à jour" on a real
 * PostgreSQL — families of one wine left apart, merged field by field or kept
 * apart for good, and "C'est bon" on a number. Two families of the same wine
 * are made the way the add form still makes them until FEAT-97 (a second
 * record confirmed as a duplicate opens its own family). The web screen comes
 * with lot J2. Figures shared by the whole instance (sidebar, budget) are
 * compared before/after, as other specs add bottles too.
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

type Unit = { id: string; productId: string; quantity: number | null; needsReview: boolean; updatedAt: string };
type Family = { id: string; region: string | null; items: Unit[] };
type Detail = Family & { tastings: { id: string }[]; history: { action: string }[] };
type Disagreement = { field: string; values: { productId: string; value: unknown }[]; preselectedProductId: string };
type Review = {
  merges: { products: Family[]; disagreements: Disagreement[]; units: number }[];
  counts: { product: Family; group: Unit; subRecords: Unit[] }[];
};
type Counts = { bottles: number; cigars: number };
type CellarStats = { bottles: number; estimatedValue: number | null };

/** Asserts a 2xx and returns the `{ data }` envelope's content. */
async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

const review = async (api: APIRequestContext) => okData<Review>(await api.get('/api/products/review'));
/** The "À regrouper ?" case holding one of `ids`, if any. */
const caseOf = (list: Review, ids: string[]) =>
  list.merges.find((c) => c.products.some((product) => ids.includes(product.id)));

/** A family of one bottle of the wine `name` 2020, in `cellarId` at 20 €, then `extra` more of the same group. */
async function createFamily(api: APIRequestContext, name: string, cellarId: string, region: string, extra: number): Promise<Unit> {
  const unit = await okData<Unit>(await api.post('/api/inventory', {
    data: {
      category: 'wine', name, producer: 'E2E Domaine', vintage: 2020, region, cellarId, purchasePrice: 20,
      // A second record of the same wine, confirmed: until FEAT-97 it opens a family of its own.
      confirmDuplicate: true,
    },
  }));
  if (extra > 0) await okData(await api.post(`/api/products/${unit.productId}/items`, { data: { quantity: extra, cellarId, purchasePrice: 20 } }));
  return unit;
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

test.describe('review after the update (#471, FEAT-102)', () => {
  const families: string[] = [];
  const cellars: string[] = [];
  const envelopes: string[] = [];
  test.afterEach(async ({ page }) => {
    const api = page.request;
    for (const productId of families.splice(0)) await api.delete(`/api/products/${productId}`).catch(() => {});
    for (const cellarId of cellars.splice(0)) await api.delete(`/api/cellars/${cellarId}`).catch(() => {});
    for (const id of envelopes.splice(0)) await api.delete(`/api/wishlist/budget-envelopes/${id}`).catch(() => {});
  });

  // c1 + c2, and the invariants of a merge: units, value and spending unchanged.
  test('two families apart for their region merge field by field into one card with every bottle and tasting', async ({ page }) => {
    const api = page.request;
    const name = `E2E #471 J1 Cuvée ${stamp()}`;
    const cellarId = (await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E #471 J1 ${stamp()}` } }))).id;
    cellars.push(cellarId);
    const envelope = await monthEnvelope(api);
    envelopes.push(envelope.id);
    const before = { counts: await okData<Counts>(await api.get('/api/stats/counts')), spent: await envelope.spent() };

    const bordeaux = await createFamily(api, name, cellarId, 'Bordeaux', 2); // ×3
    const graves = await createFamily(api, name, cellarId, 'Graves', 1); // ×2, the most recent
    families.push(bordeaux.productId, graves.productId);
    await okData(await api.post('/api/tastings', { data: { itemId: bordeaux.id, rating: 4 } }));
    await okData(await api.post('/api/tastings', { data: { itemId: graves.id, rating: 3 } }));

    const cellarBefore = (await okData<{ stats: CellarStats }>(await api.get(`/api/cellars/${cellarId}`))).stats;
    expect(cellarBefore).toMatchObject({ bottles: 5, estimatedValue: 100 });
    const countsBefore = await okData<Counts>(await api.get('/api/stats/counts'));
    expect(countsBefore.bottles - before.counts.bottles).toBe(5);
    const spentBefore = await envelope.spent();
    expect(spentBefore - before.spent).toBe(100);

    // c1: the case shows the region only, side by side, pre-selected on the most recent family.
    const proposed = caseOf(await review(api), [bordeaux.productId]);
    expect(proposed?.products.map((product) => product.id)).toEqual([bordeaux.productId, graves.productId]);
    // What the confirmation tells before merging: "2 vins → 1 vin, 5 bouteilles".
    expect(proposed?.units).toBe(5);
    expect(proposed?.disagreements).toEqual([{
      field: 'region',
      values: [{ productId: bordeaux.productId, value: 'Bordeaux' }, { productId: graves.productId, value: 'Graves' }],
      preselectedProductId: graves.productId,
    }]);

    // c2: "Graves", then "Regrouper".
    const merged = await api.post('/api/products/merge', {
      data: { productIds: [bordeaux.productId, graves.productId], choices: { region: graves.productId } },
    });
    expect(merged.ok(), await merged.text()).toBe(true);
    const body = (await merged.json()) as { data: Family; overLimits: { notes: boolean; tags: boolean }; removedProductIds: string[]; removedItemIds: string[] };
    expect(body.data).toMatchObject({ id: bordeaux.productId, region: 'Graves' });
    expect(body.removedProductIds).toEqual([graves.productId]);
    expect(body.overLimits).toEqual({ notes: false, tags: false });
    // The two groups (same cellar, price, day and size) were identical: one ×5 remains.
    expect(body.removedItemIds).toEqual([graves.id]);

    const detail = await okData<Detail>(await api.get(`/api/products/${bordeaux.productId}`));
    expect(detail.items.map((unit) => [unit.id, unit.quantity])).toEqual([[bordeaux.id, 5]]);
    expect(detail.tastings).toHaveLength(2);
    expect(detail.history.map((entry) => entry.action)).toContain('MERGE_PRODUCTS');
    expect((await api.get(`/api/products/${graves.productId}`)).status()).toBe(404);
    const cards = (await okData<Family[]>(await api.get('/api/products'))).filter((f) => [bordeaux.productId, graves.productId].includes(f.id));
    expect(cards.map((card) => card.id)).toEqual([bordeaux.productId]);

    // Same bottles, value and spending before and after.
    expect((await okData<{ stats: CellarStats }>(await api.get(`/api/cellars/${cellarId}`))).stats).toMatchObject({ bottles: 5, estimatedValue: 100 });
    expect((await okData<Counts>(await api.get('/api/stats/counts'))).bottles).toBe(countsBefore.bottles);
    expect(await envelope.spent()).toBe(spentBefore);

    // Settled for everyone: no longer proposed.
    expect(caseOf(await review(api), [bordeaux.productId, graves.productId])).toBeUndefined();
  });

  // c3: "Garder séparées" — never proposed again, even after adding bottles.
  test('families kept apart stay two cards and are never proposed again', async ({ page }) => {
    const api = page.request;
    const name = `E2E #471 J1 Autre ${stamp()}`;
    const cellarId = (await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E #471 J1 ${stamp()}` } }))).id;
    cellars.push(cellarId);
    const first = await createFamily(api, name, cellarId, 'Bordeaux', 0);
    const second = await createFamily(api, name, cellarId, 'Graves', 0);
    families.push(first.productId, second.productId);
    expect(caseOf(await review(api), [first.productId])).toBeDefined();

    const kept = await api.post('/api/products/distinctions', { data: { productIds: [second.productId, first.productId] } });
    expect(kept.status(), await kept.text()).toBe(201);

    expect(caseOf(await review(api), [first.productId, second.productId])).toBeUndefined();
    // Adding bottles of this wine later does not bring the case back.
    await okData(await api.post(`/api/products/${second.productId}/items`, { data: { quantity: 2, cellarId, purchasePrice: 20 } }));
    expect(caseOf(await review(api), [first.productId, second.productId])).toBeUndefined();
    const cards = (await okData<Family[]>(await api.get('/api/products'))).filter((f) => [first.productId, second.productId].includes(f.id));
    expect(cards).toHaveLength(2);
    // Declared different: a merge of the two is refused.
    const refused = await api.post('/api/products/merge', { data: { productIds: [first.productId, second.productId] } });
    expect(refused.status()).toBe(409);
    expect((await refused.json()).error).toBe('DISTINCT_WINES');
  });

  // c4 ("C'est bon"): only the transformation marks a guessed number, which the
  // migration bench checks on its own database; here, the route on a real
  // group: it changes nothing but the mark, and is harmless when repeated.
  test('"C\'est bon" changes nothing of a group and can be repeated', async ({ page }) => {
    const api = page.request;
    const cellarId = (await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E #471 J1 ${stamp()}` } }))).id;
    cellars.push(cellarId);
    const group = await createFamily(api, `E2E #471 J1 Compte ${stamp()}`, cellarId, 'Bordeaux', 5);
    families.push(group.productId);

    const confirmed = await okData<Unit>(await api.post(`/api/inventory/${group.id}/review-ok`));
    expect(confirmed).toMatchObject({ id: group.id, quantity: 6, needsReview: false });
    const again = await okData<Unit>(await api.post(`/api/inventory/${group.id}/review-ok`));
    expect(again).toMatchObject({ id: group.id, quantity: 6, needsReview: false, updatedAt: confirmed.updatedAt });
    expect((await review(api)).counts.some((c) => c.group.id === group.id)).toBe(false);
    expect((await api.post('/api/inventory/00000000-0000-4000-8000-000000000000/review-ok')).status()).toBe(404);
  });
});
