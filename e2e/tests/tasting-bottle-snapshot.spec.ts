import { test, expect, type APIResponse } from '@playwright/test';

/**
 * #837: a tasting keeps the bottle tasted as it was — its cellar and its
 * purchase day — written by the server when the tasting is noted. Moving the
 * bottle afterwards changes nothing; deleting the cellar keeps its name.
 * API-level on a real PostgreSQL: the foreign key's ON DELETE SET NULL and the
 * DATE column are what is checked (`api/tests/` mocks Prisma).
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

type Row = { id: string };
type Tasting = { id: string; itemId: string | null; cellarId: string | null; cellarName: string | null; purchasedAt: string | null };

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

test('a tasting keeps the cellar and purchase day of its bottle, moved or its cellar deleted', async ({ page }) => {
  const api = page.request;
  const id = stamp();
  let productId = '';
  let kitchenId = '';
  let garageId = '';
  try {
    garageId = (await okData<Row>(await api.post('/api/cellars', { data: { name: `E2E #837 Garage ${id}` } }))).id;
    kitchenId = (await okData<Row>(await api.post('/api/cellars', { data: { name: `E2E #837 Cuisine ${id}` } }))).id;
    const bottle = await okData<{ id: string; productId: string }>(await api.post('/api/inventory', {
      data: { category: 'wine', name: `E2E #837 ${id}`, producer: 'E2E Domaine', cellarId: garageId, purchasedAt: '2025-03-12' },
    }));
    productId = bottle.productId;

    const noted = await okData<Tasting>(await api.post('/api/tastings', { data: { itemId: bottle.id, rating: 4 } }));
    expect(noted).toMatchObject({ cellarId: garageId, cellarName: `E2E #837 Garage ${id}` });
    expect(noted.purchasedAt?.slice(0, 10)).toBe('2025-03-12');

    // Moved after its tasting: the tasting still says the cellar it was tasted in.
    await okData(await api.patch(`/api/inventory/${bottle.id}`, { data: { cellarId: kitchenId } }));
    const tastingOf = async () => (await okData<{ tastings: Tasting[] }>(await api.get(`/api/products/${productId}`)))
      .tastings.find((tasting) => tasting.id === noted.id);
    expect(await tastingOf()).toMatchObject({ itemId: bottle.id, cellarId: garageId, cellarName: `E2E #837 Garage ${id}` });

    // Its cellar deleted: the link goes, the name stays.
    expect((await api.delete(`/api/cellars/${garageId}`)).status()).toBe(204);
    garageId = '';
    const kept = await tastingOf();
    expect(kept).toMatchObject({ cellarId: null, cellarName: `E2E #837 Garage ${id}` });
    expect(kept?.purchasedAt?.slice(0, 10)).toBe('2025-03-12');
  } finally {
    if (productId) await api.delete(`/api/products/${productId}`).catch(() => {});
    if (garageId) await api.delete(`/api/cellars/${garageId}`).catch(() => {});
    if (kitchenId) await api.delete(`/api/cellars/${kitchenId}`).catch(() => {});
  }
});
