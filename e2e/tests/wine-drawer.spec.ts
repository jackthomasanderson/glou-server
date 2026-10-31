import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * #471 FEAT-92 c4 (ux-ui.md §10.3): correcting the region once, from the
 * drawer of a wine, corrects it for every one of its bottles.
 */

type Unit = { id: string; productId: string; region?: string | null };

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

async function flatBottlesOf(api: APIRequestContext, productId: string): Promise<Unit[]> {
  return (await okData<Unit[]>(await api.get('/api/inventory'))).filter((item) => item.productId === productId);
}

test('the region corrected once in the drawer of a wine is every bottle\'s (FEAT-92 c4)', async ({ page }) => {
  const api = page.request;
  const name = `E2E c4 ${Date.now()}-${Math.round(Math.random() * 1e4)}`;
  const first = await okData<Unit>(await api.post('/api/inventory', {
    data: { category: 'wine', name, producer: 'E2E Domaine', vintage: 2019, region: 'Bordeaux', purchasePrice: 20 },
  }));
  const { productId } = first;
  try {
    // A second line of the same wine: 2 bottles bought at another price.
    await okData(await api.post(`/api/products/${productId}/items`, { data: { quantity: 2, purchasePrice: 25 } }));

    await page.goto(`/bottles?scan=${encodeURIComponent(productId)}`);
    const drawer = page.getByRole('dialog').filter({ has: page.locator('#inventory-detail-title') });
    await expect(drawer.locator('#inventory-detail-title')).toHaveText(name);
    await expect(drawer.getByTestId('family-line')).toHaveCount(2);
    await expect(drawer.getByTestId('family-drawer-stock')).toContainText('3 bouteilles');

    await drawer.getByRole('button', { name: 'Modifier', exact: true }).click();
    const form = page.getByRole('dialog').filter({ has: page.getByTestId('inventory-form-submit') });
    await expect(form.getByTestId('description-scope')).toHaveText('Modifie ce vin pour ses 3 bouteilles.');
    // No field of a bottle in it: its price is on its line.
    await expect(form.getByLabel('Caves')).toHaveCount(0);
    const region = form.getByLabel('Région');
    await expect(region).toHaveValue('Bordeaux');
    await region.fill('Médoc');

    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/products/${productId}`) && r.request().method() === 'PATCH');
    await form.getByTestId('inventory-form-submit').click();
    const res = await saved;
    expect(res.status(), await res.text()).toBe(200);
    expect(Object.keys(res.request().postDataJSON() as object).sort()).toEqual(['expectedUpdatedAt', 'region']);
    await expect(form).toBeHidden();

    // Back to the drawer, which shows the new region.
    await expect(drawer).toContainText('Médoc');
    // The wine and each of its bottles.
    expect((await okData<{ region: string }>(await api.get(`/api/products/${productId}`))).region).toBe('Médoc');
    const bottles = await flatBottlesOf(api, productId);
    expect(bottles).toHaveLength(2);
    expect(bottles.map((bottle) => bottle.region)).toEqual(['Médoc', 'Médoc']);
  } finally {
    await api.delete(`/api/products/${productId}`).catch(() => {});
  }
});
