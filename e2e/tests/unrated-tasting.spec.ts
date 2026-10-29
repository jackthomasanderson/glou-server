import { test, expect, type APIResponse } from '@playwright/test';

/**
 * #704: the tasting form sends `rating: null` when no star is picked, and
 * when the picked star is clicked again to remove it. The API refused that
 * null (400 VALIDATION_ERROR), so an unrated tasting could be neither
 * created nor saved after removing its stars.
 *
 * API-level, with the exact payload the form sends, against the real
 * database: the stored note must keep `rating` null, and the bottle's
 * average must only count rated tastings.
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

type Row = { id: string };

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

test('a tasting can be saved without stars, and its stars removed', async ({ page }) => {
  const api = page.request;
  let itemId = '';
  const tastingIds: string[] = [];
  try {
    itemId = (
      await okData<Row>(
        await api.post('/api/inventory', {
          data: { category: 'wine', name: `E2E #704 ${stamp()}`, producer: 'E2E Domaine' },
        }),
      )
    ).id;

    // What TastingForm sends for a new tasting with no star picked.
    const formDefaults = {
      itemId,
      rating: null,
      readiness: null,
      notes: '',
      context: '',
      foodPairing: '',
      tastedAt: new Date().toISOString().slice(0, 10),
      robe: null,
      nez: null,
      bouche: null,
      tanin: null,
      acidite: null,
      longueurBouche: null,
    };
    const unrated = await okData<Row & { rating: number | null }>(
      await api.post('/api/tastings', { data: formDefaults }),
    );
    tastingIds.push(unrated.id);
    expect(unrated.rating).toBeNull();

    // A rated tasting whose star is then clicked again to remove it.
    const rated = await okData<Row & { rating: number | null }>(
      await api.post('/api/tastings', { data: { ...formDefaults, rating: 4 } }),
    );
    tastingIds.push(rated.id);
    expect(rated.rating).toBe(4);
    const cleared = await okData<Row & { rating: number | null }>(
      await api.patch(`/api/tastings/${rated.id}`, { data: { rating: null } }),
    );
    expect(cleared.rating).toBeNull();

    // Rate one again: the average counts it and ignores the unrated one.
    await okData(await api.patch(`/api/tastings/${rated.id}`, { data: { rating: 3 } }));
    const stats = await okData<{ count: number; avgRating: number | null }>(
      await api.get(`/api/tastings/stats/${itemId}`),
    );
    expect(stats.count).toBe(2);
    expect(stats.avgRating).toBe(3);
  } finally {
    // Deleting a bottle keeps its tastings, so they go first.
    for (const id of tastingIds) await api.delete(`/api/tastings/${id}`).catch(() => {});
    if (itemId) await api.delete(`/api/inventory/${itemId}`).catch(() => {});
  }
});
