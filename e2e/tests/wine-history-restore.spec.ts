import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * #471 FEAT-05: a change of a wine's description (made once for all its
 * bottles, FEAT-92 c4) is restored from the wine's history — for every one
 * of its bottles.
 */

type Unit = { id: string; productId: string; region?: string | null };
type Family = { id: string; region: string | null; updatedAt: string };

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

async function flatBottlesOf(api: APIRequestContext, productId: string): Promise<Unit[]> {
  return (await okData<Unit[]>(await api.get('/api/inventory'))).filter((item) => item.productId === productId);
}

test('the region corrected in the drawer of a wine is restored from its history, for every bottle (FEAT-05)', async ({ page }) => {
  const api = page.request;
  const name = `E2E restore ${Date.now()}-${Math.round(Math.random() * 1e4)}`;
  const { productId } = await okData<Unit>(await api.post('/api/inventory', {
    data: { category: 'wine', name, producer: 'E2E Domaine', vintage: 2019, region: 'Bordeaux', purchasePrice: 20 },
  }));
  try {
    // A second line of the same wine: 2 bottles bought at another price.
    await okData(await api.post(`/api/products/${productId}/items`, { data: { quantity: 2, purchasePrice: 25 } }));

    await page.goto(`/bottles?scan=${encodeURIComponent(productId)}`);
    const drawer = page.getByRole('dialog').filter({ has: page.locator('#inventory-detail-title') });
    await expect(drawer.locator('#inventory-detail-title')).toHaveText(name);

    // The region corrected once, from the drawer.
    await drawer.getByRole('button', { name: 'Modifier', exact: true }).click();
    const form = page.getByRole('dialog').filter({ has: page.getByTestId('inventory-form-submit') });
    await form.getByLabel('Région').fill('Médoc');
    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/products/${productId}`) && r.request().method() === 'PATCH');
    await form.getByTestId('inventory-form-submit').click();
    expect((await saved).status()).toBe(200);
    await expect(form).toBeHidden();
    expect((await flatBottlesOf(api, productId)).map((bottle) => bottle.region)).toEqual(['Médoc', 'Médoc']);

    // The change of the wine is in its history, with "Restaurer cette valeur".
    const history = drawer.getByTestId('family-history');
    const change = history.locator('li').filter({ hasText: 'Région : Médoc' });
    await expect(change).toHaveCount(1);
    await change.getByRole('button', { name: 'Restaurer cette valeur' }).click();

    const confirm = page.getByRole('dialog').filter({ hasText: 'Restaurer cette valeur ?' });
    await expect(confirm).toContainText('Le champ « Région » sera restauré à : Bordeaux.');
    const restored = page.waitForResponse((r) => r.url().endsWith(`/api/products/${productId}/rollback`));
    await confirm.getByRole('button', { name: 'Restaurer', exact: true }).click();
    const res = await restored;
    expect(res.status(), await res.text()).toBe(200);
    expect(res.request().postDataJSON()).toMatchObject({ field: 'region', toValue: 'Bordeaux', expectedUpdatedAt: expect.any(String) });
    await expect(confirm).toBeHidden();

    // The restore itself is in the history.
    await expect(history).toContainText('Valeur restaurée : Région');
    // The wine and each of its bottles are back to the old value.
    expect((await okData<Family>(await api.get(`/api/products/${productId}`))).region).toBe('Bordeaux');
    const bottles = await flatBottlesOf(api, productId);
    expect(bottles).toHaveLength(2);
    expect(bottles.map((bottle) => bottle.region)).toEqual(['Bordeaux', 'Bordeaux']);
  } finally {
    await api.delete(`/api/products/${productId}`).catch(() => {});
  }
});

test('the restore of a wine\'s value refuses a field of its bottles, a value not in its history and a stale version', async ({ page }) => {
  const api = page.request;
  const name = `E2E restore refused ${Date.now()}-${Math.round(Math.random() * 1e4)}`;
  const { productId } = await okData<Unit>(await api.post('/api/inventory', {
    data: { category: 'wine', name, producer: 'E2E Domaine', region: 'Bordeaux', purchasePrice: 20 },
  }));
  try {
    const before = await okData<Family>(await api.get(`/api/products/${productId}`));
    const edited = await okData<Family>(await api.patch(`/api/products/${productId}`, {
      data: { region: 'Médoc', expectedUpdatedAt: before.updatedAt },
    }));
    const rollback = (data: object) => api.post(`/api/products/${productId}/rollback`, { data });

    const priceRes = await rollback({ field: 'purchasePrice', toValue: 20 });
    expect(priceRes.status()).toBe(400);
    expect((await priceRes.json()).error).toBe('FIELD_NOT_RESTORABLE');

    const unknownRes = await rollback({ field: 'region', toValue: 'Bourgogne' });
    expect(unknownRes.status()).toBe(400);
    expect((await unknownRes.json()).error).toBe('VALUE_NOT_IN_HISTORY');

    // The version read before the edit is stale: refused, nothing written.
    const staleRes = await rollback({ field: 'region', toValue: 'Bordeaux', expectedUpdatedAt: before.updatedAt });
    expect(staleRes.status()).toBe(409);
    expect((await staleRes.json()).data.region).toBe('Médoc');

    const restored = await okData<Family>(await rollback({ field: 'region', toValue: 'Bordeaux', expectedUpdatedAt: edited.updatedAt }));
    expect(restored.region).toBe('Bordeaux');
  } finally {
    await api.delete(`/api/products/${productId}`).catch(() => {});
  }
});
