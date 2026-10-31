import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * #471 (FEAT-92 c4-c5, FEAT-101 c1/c5, D9/D10): the families API on a real
 * PostgreSQL — the list filters (trash computed from the units, wines known
 * without bottle), the description written once for every bottle, the trash
 * of a whole family and the row lock that serialises concurrent edits of one
 * family. API level only: the web still reads /api/inventory (lots W1-W3).
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

type Unit = { id: string; productId: string; updatedAt: string; deletedAt: string | null; purchasedAt: string | null };
type Family = {
  id: string; name: string; region: string | null; color: string | null; updatedAt: string; lockedFields: string[];
  peakMaturityFrom: number | null; peakMaturityTo: number | null; deletedAt: string | null; lastActivityAt: string | null;
  alertsPaused: boolean;
  collections: { id: string }[]; items: Unit[];
};
type Detail = Family & {
  tastings: { id: string }[];
  history: { action: string; itemId: string | null; changes: { field: string; from: unknown; to: unknown }[] | null }[];
};

/** Asserts a 2xx and returns the `{ data }` envelope's content. */
async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

/** A wine added the usual way: a unit and its own family. */
async function addWine(api: APIRequestContext, label: string, extra: Record<string, unknown> = {}): Promise<Unit> {
  return okData<Unit>(await api.post('/api/inventory', {
    data: { category: 'wine', name: `E2E #471 ${label}`, producer: 'E2E Domaine', ...extra },
  }));
}

async function listedFamily(api: APIRequestContext, productId: string): Promise<Family | undefined> {
  const list = await okData<Family[]>(await api.get('/api/products'));
  return list.find((family) => family.id === productId);
}

test.describe('families API (#471)', () => {
  const families: string[] = [];
  test.afterEach(async ({ page }) => {
    for (const productId of families.splice(0)) await page.request.delete(`/api/products/${productId}`).catch(() => {});
  });

  // FEAT-92 (D9): one card per wine, its groups under it. Needs a way to add
  // bottles to an existing wine — `POST /api/products/:id/items`, lot A2.
  test.fixme('one family lists each of its groups (enabled by A2)', async ({ page }) => {
    const api = page.request;
    const first = await addWine(api, `Groups ${stamp()}`, { purchasePrice: 20 });
    families.push(first.productId);
    await okData(await api.post(`/api/products/${first.productId}/items`, { data: { quantity: 2, purchasePrice: 25 } }));

    const family = await listedFamily(api, first.productId);
    expect(family?.items).toHaveLength(2);
  });

  // FEAT-92 c4: the description is corrected once, for every bottle.
  test('a description written on the family is what every reader sees', async ({ page }) => {
    const api = page.request;
    const unit = await addWine(api, `Region ${stamp()}`, { region: 'Bordeaux', purchasePrice: 20 });
    families.push(unit.productId);
    // D6: the purchase day defaults to today, served as a day.
    expect(unit.purchasedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);

    const before = await okData<Detail>(await api.get(`/api/products/${unit.productId}`));
    expect(before.items.map((item) => item.purchasedAt)).toEqual([expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)]);
    const written = await okData<Family>(await api.patch(`/api/products/${unit.productId}`, {
      data: { region: 'Médoc', expectedUpdatedAt: before.updatedAt },
    }));
    expect(written).toMatchObject({ region: 'Médoc', lockedFields: ['region'] });

    // The list, the detail and the flat record of its bottle.
    expect(await listedFamily(api, unit.productId)).toMatchObject({ region: 'Médoc' });
    const detail = await okData<Detail>(await api.get(`/api/products/${unit.productId}`));
    expect(detail.region).toBe('Médoc');
    const flat = await okData<{ region: string; updatedAt: string }>(await api.get(`/api/inventory/${unit.id}`));
    expect(flat.region).toBe('Médoc');
    // D22: the bottle itself did not change — a pending offline edit of it stays valid.
    expect(flat.updatedAt).toBe(unit.updatedAt);
    // The family's history holds the change, not attached to any bottle.
    expect(detail.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'UPDATE', itemId: null, changes: [{ field: 'region', from: 'Bordeaux', to: 'Médoc' }] }),
      expect.objectContaining({ action: 'CREATE', itemId: unit.id }),
    ]));

    // A stale form gets a conflict and the family as it is now.
    const stale = await api.patch(`/api/products/${unit.productId}`, {
      data: { region: 'Graves', expectedUpdatedAt: before.updatedAt },
    });
    expect(stale.status()).toBe(409);
    expect((await stale.json()).data).toMatchObject({ region: 'Médoc' });

    // A field of the bottles is not part of the description.
    expect((await api.patch(`/api/products/${unit.productId}`, { data: { purchasePrice: 30 } })).status()).toBe(400);
  });

  // FEAT-101 c1/c5, D10: drunk to the last bottle, the wine stays known;
  // its trash takes it out of every list, its restore brings it back.
  test('a wine known without bottle is listed, then trashed and restored as a whole', async ({ page }) => {
    const api = page.request;
    const unit = await addWine(api, `Known ${stamp()}`);
    families.push(unit.productId);
    await okData(await api.patch(`/api/inventory/${unit.id}`, { data: { isOpened: true, fillLevel: 0 } }));

    // Listed, with no bottle in stock, dated by the bottle drunk (§10.5);
    // the detail still holds it.
    const known = await listedFamily(api, unit.productId);
    expect(known).toMatchObject({ items: [] });
    expect(known?.lastActivityAt).toEqual(expect.any(String));
    const detail = await okData<Detail>(await api.get(`/api/products/${unit.productId}`));
    expect(detail.items.map((item) => item.id)).toEqual([unit.id]);

    const trashed = await okData<{ deletedAt: string; itemIds: string[] }>(await api.delete(`/api/products/${unit.productId}`));
    expect(trashed.itemIds).toEqual([unit.id]);
    expect(await listedFamily(api, unit.productId)).toBeUndefined();
    expect((await api.get(`/api/products/${unit.productId}`)).status()).toBe(404);
    const flatList = await okData<{ id: string }[]>(await api.get('/api/inventory'));
    expect(flatList.map((item) => item.id)).not.toContain(unit.id);
    const trash = await okData<Family[]>(await api.get('/api/products/trash'));
    expect(trash.find((family) => family.id === unit.productId)?.items.map((item) => item.id)).toEqual([unit.id]);

    await okData(await api.post(`/api/products/${unit.productId}/restore`));
    expect(await listedFamily(api, unit.productId)).toMatchObject({ items: [] });
    expect(await okData<{ id: string }>(await api.get(`/api/inventory/${unit.id}`))).toMatchObject({ id: unit.id });
  });

  // D10: a family whose every bottle is in the trash follows the trash.
  test('a family whose bottles are all in the trash leaves the list, and comes back with one of them', async ({ page }) => {
    const api = page.request;
    const unit = await addWine(api, `Trashed bottle ${stamp()}`);
    families.push(unit.productId);

    await okData(await api.delete(`/api/inventory/${unit.id}`));
    expect(await listedFamily(api, unit.productId)).toBeUndefined();
    // Computed as in the trash: not a family one can trash again (D10).
    expect((await api.delete(`/api/products/${unit.productId}`)).status()).toBe(404);

    await okData(await api.post(`/api/inventory/${unit.id}/restore`));
    expect((await listedFamily(api, unit.productId))?.items.map((item) => item.id)).toEqual([unit.id]);
  });

  // F2 review: the family is locked before its fields are written, whichever
  // route writes them — no lock lost, no reversed drinking window.
  test('concurrent edits of one family keep every lock and a drinking window in order', async ({ page }) => {
    const api = page.request;
    const unit = await addWine(api, `Concurrent ${stamp()}`);
    families.push(unit.productId);

    for (let round = 0; round < 5; round++) {
      const [throughBottle, throughFamily] = await Promise.all([
        api.patch(`/api/inventory/${unit.id}`, { data: { region: `Région ${round}` } }),
        api.patch(`/api/products/${unit.productId}`, { data: { color: round % 2 ? 'red' : 'white' } }),
      ]);
      expect(throughBottle.ok(), await throughBottle.text()).toBe(true);
      expect(throughFamily.ok(), await throughFamily.text()).toBe(true);
    }
    const locked = await okData<Detail>(await api.get(`/api/products/${unit.productId}`));
    expect([...locked.lockedFields].sort()).toEqual(['color', 'region']);

    for (let round = 0; round < 5; round++) {
      await okData(await api.patch(`/api/products/${unit.productId}`, { data: { peakMaturityFrom: null, peakMaturityTo: null } }));
      const answers = await Promise.all([
        api.patch(`/api/inventory/${unit.id}`, { data: { peakMaturityFrom: 2030 } }),
        api.patch(`/api/products/${unit.productId}`, { data: { peakMaturityTo: 2025 } }),
      ]);
      // Whichever came second saw the other end and was refused.
      expect(answers.map((answer) => answer.status()).sort()).toEqual([200, 400]);
      const family = await okData<Detail>(await api.get(`/api/products/${unit.productId}`));
      expect(family.peakMaturityFrom === null || family.peakMaturityTo === null).toBe(true);
    }
  });

  // A1 review: the pause is flipped on the family as stored once locked —
  // an even number of toggles, however concurrent, leaves it as it was.
  test('concurrent alert pause toggles never cancel each other out', async ({ page }) => {
    const api = page.request;
    const unit = await addWine(api, `Pause ${stamp()}`);
    families.push(unit.productId);

    const answers = await Promise.all(Array.from({ length: 6 }, () => api.patch(`/api/alerts/${unit.id}/pause`)));
    for (const answer of answers) expect(answer.ok(), await answer.text()).toBe(true);
    expect((await okData<Detail>(await api.get(`/api/products/${unit.productId}`))).alertsPaused).toBe(false);
  });

  // F2 review: a collection holds the family, whichever bottle named it.
  test('a collection holds the family of the bottle it was given', async ({ page }) => {
    const api = page.request;
    const unit = await addWine(api, `Collection ${stamp()}`);
    families.push(unit.productId);
    const collection = await okData<{ id: string }>(await api.post('/api/collections', { data: { name: `E2E #471 ${stamp()}` } }));
    try {
      const added = await okData<{ products: { id: string }[]; items: { id: string }[] }>(
        await api.post(`/api/collections/${collection.id}/items`, { data: { itemIds: [unit.id] } }),
      );
      expect(added.products).toEqual([{ id: unit.productId }]);
      expect(added.items).toEqual([{ id: unit.id }]);
      expect((await listedFamily(api, unit.productId))?.collections.map((c) => c.id)).toEqual([collection.id]);

      const removed = await okData<{ products: unknown[] }>(await api.delete(`/api/collections/${collection.id}/items/${unit.id}`));
      expect(removed.products).toEqual([]);
      expect((await listedFamily(api, unit.productId))?.collections).toEqual([]);

      await okData(await api.post(`/api/collections/${collection.id}/products`, { data: { productIds: [unit.productId] } }));
      expect((await okData<{ collections: { id: string }[] }>(await api.get(`/api/inventory/${unit.id}`))).collections)
        .toEqual([expect.objectContaining({ id: collection.id })]);
    } finally {
      await api.delete(`/api/collections/${collection.id}`).catch(() => {});
    }
  });
});
