import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * #962: an administrator deletes an entry of the trash for good, or empties
 * the trash of a page. Against the real database: the API unit tests mock
 * Prisma, and the rows (a line, its family, the category filter through the
 * family) are only really deleted here. The suite's user is the instance's
 * administrator on a fresh CI database; the refusal to a member (403) is
 * covered by api/tests/routes/trash-permanent.router.test.ts.
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

type Line = { id: string; productId: string };

async function createLine(api: APIRequestContext, data: Record<string, unknown>): Promise<Line> {
  return okData<Line>(await api.post('/api/inventory', { data }));
}

async function trashIds(api: APIRequestContext): Promise<{ lines: string[]; wines: string[] }> {
  const lines = await okData<{ id: string }[]>(await api.get('/api/inventory/trash'));
  const wines = await okData<{ id: string }[]>(await api.get('/api/products/trash'));
  return { lines: lines.map((line) => line.id), wines: wines.map((wine) => wine.id) };
}

test.describe('#962 — delete for good from the trash', () => {
  test.beforeEach(async ({ page }) => {
    const me = await okData<{ isAdmin: boolean }>(await page.request.get('/api/user/me'));
    test.skip(!me.isAdmin, 'needs the suite user to be the instance admin (fresh database)');
  });

  test('API: a line or a wine of the trash only, then the cigars page emptied without touching the wines', async ({ page }) => {
    const api = page.request;
    const kept = await createLine(api, { category: 'wine', name: `E2E 962 kept ${stamp()}`, producer: 'E2E Domaine' });
    const line = await createLine(api, { category: 'wine', name: `E2E 962 line ${stamp()}`, producer: 'E2E Domaine' });
    const wine = await createLine(api, { category: 'wine', name: `E2E 962 wine ${stamp()}`, producer: 'E2E Domaine', quantity: 3 });
    const cigar = await createLine(api, { category: 'cigar', name: `E2E 962 cigar ${stamp()}`, producer: 'E2E Maison', quantity: 2, cigarsPerBox: 10 });
    const wineLeft = await createLine(api, { category: 'wine', name: `E2E 962 left ${stamp()}`, producer: 'E2E Domaine' });

    try {
      // Not in the trash: refused, nothing deleted.
      expect((await api.delete(`/api/inventory/trash/${kept.id}`)).status()).toBe(404);
      expect((await api.delete(`/api/products/trash/${kept.productId}`)).status()).toBe(404);
      await okData(await api.get(`/api/inventory/${kept.id}`));

      // One line: gone, its family with it (no tasting); asked again, 404.
      await okData(await api.delete(`/api/inventory/${line.id}`));
      const deletedLine = await okData<{ itemIds: string[]; productIds: string[] }>(await api.delete(`/api/inventory/trash/${line.id}`));
      expect(deletedLine).toEqual({ itemIds: [line.id], productIds: [line.productId] });
      expect((await trashIds(api)).lines).not.toContain(line.id);
      expect((await api.get(`/api/products/${line.productId}`)).status()).toBe(404);
      expect((await api.delete(`/api/inventory/trash/${line.id}`)).status()).toBe(404);

      // A wine: with its bottles.
      await okData(await api.delete(`/api/products/${wine.productId}`));
      const deletedWine = await okData<{ itemIds: string[]; productIds: string[] }>(await api.delete(`/api/products/trash/${wine.productId}`));
      expect(deletedWine).toEqual({ itemIds: [wine.id], productIds: [wine.productId] });
      const afterWine = await trashIds(api);
      expect(afterWine.wines).not.toContain(wine.productId);
      expect(afterWine.lines).not.toContain(wine.id);

      // The cigars page emptied: the cigar goes, the wine line in the trash stays.
      await okData(await api.delete(`/api/inventory/${cigar.id}`));
      await okData(await api.delete(`/api/inventory/${wineLeft.id}`));
      const emptied = await okData<{ itemIds: string[] }>(await api.post('/api/inventory/trash/empty', { data: { categories: ['cigar'] } }));
      expect(emptied.itemIds).toContain(cigar.id);
      expect(emptied.itemIds).not.toContain(wineLeft.id);
      const afterEmpty = await trashIds(api);
      expect(afterEmpty.lines).not.toContain(cigar.id);
      expect(afterEmpty.lines).toContain(wineLeft.id);
      // Nothing out of the trash was touched.
      await okData(await api.get(`/api/inventory/${kept.id}`));
    } finally {
      await api.delete(`/api/inventory/${kept.id}`).catch(() => {});
      await api.delete(`/api/inventory/${wineLeft.id}`).catch(() => {});
    }
  });

  test('UI: delete a bottle for good from the trash, behind a confirmation', async ({ page }) => {
    const api = page.request;
    const name = `E2E 962 UI ${stamp()}`;
    const line = await createLine(api, { category: 'wine', name, producer: 'E2E Domaine' });
    await okData(await api.delete(`/api/inventory/${line.id}`));

    await page.goto('/bottles');
    await page.getByRole('tab', { name: 'Corbeille' }).click();
    const entry = page.getByRole('listitem').filter({ hasText: name });
    await expect(entry).toBeVisible();
    await expect(page.getByText(/supprimé définitivement après 7 jours/)).toBeVisible();

    await entry.getByRole('button', { name: 'Supprimer définitivement' }).click();
    const confirm = page.getByRole('dialog').filter({ hasText: 'Supprimer définitivement ?' });
    await expect(confirm).toContainText(`Supprimer définitivement 1 bouteille de E2E Domaine — ${name} ?`);
    await expect(confirm).toContainText('Cette action est irréversible.');
    await confirm.getByRole('button', { name: 'Supprimer définitivement' }).click();
    await expect(confirm).toBeHidden();
    await expect(entry).toHaveCount(0);
    expect((await trashIds(api)).lines).not.toContain(line.id);
  });
});
