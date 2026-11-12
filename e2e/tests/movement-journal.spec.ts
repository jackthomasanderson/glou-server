import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { creds } from './_helpers';

/**
 * #848 (FEAT-110): a wine's movement journal, on a real database — every
 * path that changes a number of bottles or their price writes it, in the same
 * transaction. API level: the drawer's rendering is covered by the web unit
 * tests (FamilyMovements), the first line written by the update by the
 * migration bench (e2e/migration/check-stock-movements-migration.sh).
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

type Unit = { id: string; productId: string; cellarId: string | null; quantity: number | null; updatedAt: string };
type Movement = {
  kind: string; delta: number; count: number; itemId: string | null;
  author: { kind: string; name?: string | null };
  cellar: { id: string; name: string | null } | null;
  fromCellar?: { id: string } | null; toCellar?: { id: string } | null;
  fromPrice?: number | null; toPrice?: number | null; from?: number; to?: number; reason?: string;
};

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

async function journal(api: APIRequestContext, productId: string): Promise<Movement[]> {
  return okData<Movement[]>(await api.get(`/api/products/${productId}/movements`));
}

test.describe('movement journal (#848, FEAT-110)', () => {
  const families: string[] = [];
  const cellars: string[] = [];
  const shares: string[] = [];
  test.afterEach(async ({ page }) => {
    const api = page.request;
    for (const id of shares.splice(0)) await api.delete(`/api/shares/${id}`).catch(() => {});
    for (const id of families.splice(0)) await api.delete(`/api/products/${id}`).catch(() => {});
    for (const id of cellars.splice(0)) await api.delete(`/api/cellars/${id}`).catch(() => {});
  });

  async function cellar(api: APIRequestContext, label: string): Promise<string> {
    const id = (await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E #848 ${label} ${stamp()}` } }))).id;
    cellars.push(id);
    return id;
  }

  async function sixInGarage(api: APIRequestContext, garage: string): Promise<Unit> {
    const group = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'wine', name: `E2E #848 ${stamp()}`, producer: 'E2E Domaine', purchasePrice: 20, quantity: 6, cellarId: garage },
    }));
    families.push(group.productId);
    return group;
  }

  // Criterion 1.
  test('add 6, move 2, open 1, correct 4 → 3: four dated lines with author and difference; a new price of 2 adds a fifth', async ({ page }) => {
    const api = page.request;
    const garage = await cellar(api, 'Garage');
    const kitchen = await cellar(api, 'Cuisine');
    const group = await sixInGarage(api, garage);

    const moved = await okData<Unit>(await api.post(`/api/inventory/${group.id}/move`, { data: { count: 2, cellarId: kitchen } }));
    expect(moved.cellarId).toBe(kitchen);
    await okData(await api.patch(`/api/inventory/${moved.id}`, { data: { isOpened: true, fillLevel: 60 } }));
    await okData(await api.post(`/api/inventory/${group.id}/correct`, { data: { quantity: 3, reason: 'written_off' } }));

    const lines = await journal(api, group.productId);
    expect(lines.map(({ kind, delta, count }) => [kind, delta, count])).toEqual([
      ['CORRECTED', -1, 1],
      ['OPENED', 0, 1],
      ['MOVED', 0, 2],
      ['ADDED', 6, 6],
    ]);
    expect(lines.every((line) => line.author.kind === 'member' && !!line.author.name)).toBe(true);
    expect(lines[0]).toMatchObject({ from: 4, to: 3, reason: 'written_off', cellar: { id: garage } });
    expect(lines[1]).toMatchObject({ cellar: { id: kitchen } });
    expect(lines[2]).toMatchObject({ fromCellar: { id: garage }, toCellar: { id: kitchen } });

    await okData(await api.post(`/api/inventory/${group.id}/reprice`, { data: { count: 2, purchasePrice: 25 } }));
    const [repriced, ...before] = await journal(api, group.productId);
    expect(repriced).toMatchObject({ kind: 'PRICE_CHANGED', count: 2, delta: 0, fromPrice: 20, toPrice: 25 });
    expect(before).toHaveLength(4);
  });

  // Criterion 2.
  test('a bottle drunk by a guest is in the journal, named as the guest\'s', async ({ page, browser }) => {
    const api = page.request;
    const garage = await cellar(api, 'Guest');
    const group = await sixInGarage(api, garage);
    const share = await okData<{ id: string; token: string }>(await api.post('/api/shares', {
      data: { label: `E2E #848 ${stamp()}`, inviteeName: 'Paul', cellarIds: [garage], writeCellarIds: [garage], password: creds().password, collectionIds: [] },
    }));
    shares.push(share.id);

    const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const drunk = await guest.request.patch(`/api/guest/${share.token}/inventory/${group.id}`, { data: { isOpened: true, fillLevel: 0 } });
      expect(drunk.ok(), await drunk.text()).toBe(true);
    } finally {
      await guest.close();
    }

    const [latest] = await journal(api, group.productId);
    expect(latest).toMatchObject({ kind: 'CONSUMED', delta: -1, count: 1, author: { kind: 'guest', name: 'Paul' } });
  });

  // Criterion 3: the offline queue replays a change with the version it saw;
  // a second replay of the same change is a conflict, never applied twice.
  test('an opening replayed twice from the offline queue is in the journal once', async ({ page }) => {
    const api = page.request;
    const garage = await cellar(api, 'Offline');
    const group = await sixInGarage(api, garage);
    const queued = { isOpened: true, fillLevel: 70, expectedUpdatedAt: group.updatedAt };

    await okData(await api.patch(`/api/inventory/${group.id}`, { data: queued }));
    expect((await api.patch(`/api/inventory/${group.id}`, { data: queued })).status()).toBe(409);

    const lines = await journal(api, group.productId);
    expect(lines.filter((line) => line.kind === 'OPENED')).toHaveLength(1);
  });

  // Criterion 4 (second half): a description change is history, not a movement.
  test('changing the region adds no movement, but shows in the field history', async ({ page }) => {
    const api = page.request;
    const garage = await cellar(api, 'Region');
    const group = await sixInGarage(api, garage);
    const before = await journal(api, group.productId);

    await okData(await api.patch(`/api/products/${group.productId}`, { data: { region: 'Médoc' } }));

    expect(await journal(api, group.productId)).toEqual(before);
    const detail = await okData<{ history: Array<{ changes: Array<{ field: string }> | null }> }>(await api.get(`/api/products/${group.productId}`));
    expect(detail.history.some((entry) => (entry.changes ?? []).some((change) => change.field === 'region'))).toBe(true);
  });

  test('an unknown wine has no journal', async ({ page }) => {
    expect((await page.request.get('/api/products/00000000-0000-4000-8000-000000000000/movements')).status()).toBe(404);
  });
});
