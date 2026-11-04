import { test, expect, type APIResponse } from '@playwright/test';

/**
 * Recette #471 (lot RD point 5): on a cellar's page, a wine's card had no
 * photo nor number, the breadcrumb did not name the cellar, and the drawer
 * opened from it had neither "Ajouter des bouteilles" nor "Modifier".
 */
async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return ((await res.json()) as { data: T }).data;
}

test('a cellar shows its wines with their bottles here, and their drawer has every action', async ({ page }) => {
  const api = page.request;
  const stamp = Date.now();
  const cellar = await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E Cave RD ${stamp}` } }));
  const other = await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E Autre RD ${stamp}` } }));
  const unit = await okData<{ id: string; productId: string }>(await api.post('/api/inventory', {
    data: { category: 'wine', name: `E2E Cuvée RD ${stamp}`, producer: 'E2E Domaine', quantity: 2, cellarId: cellar.id, purchasePrice: 20 },
  }));
  await okData(await api.post(`/api/products/${unit.productId}/items`, { data: { quantity: 3, cellarId: other.id, purchasePrice: 20 } }));
  try {
    await page.goto(`/cellars/${cellar.id}`);
    await expect(page.getByRole('banner')).toContainText(`E2E Cave RD ${stamp}`);
    await expect(page).toHaveTitle(new RegExp(`^E2E Cave RD ${stamp}`));

    await page.getByRole('button', { name: 'Vue en cartes' }).click();
    const card = page.getByTestId('cellar-wine-card').filter({ hasText: `E2E Cuvée RD ${stamp}` });
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId('cellar-wine-stock')).toHaveText(/^2\s+ici\s*·\s+5\s+en\s+tout$/);

    await card.click();
    const drawer = page.getByRole('dialog').filter({ has: page.locator('#inventory-detail-title') });
    await expect(drawer.getByTestId('add-units-button')).toBeVisible();
    await drawer.getByRole('button', { name: 'Modifier', exact: true }).click();
    const form = page.getByRole('dialog').filter({ has: page.getByTestId('inventory-form-submit') });
    await expect(form.getByTestId('inventory-name-input')).toHaveValue(`E2E Cuvée RD ${stamp}`);
  } finally {
    await api.delete(`/api/products/${unit.productId}`);
    await api.delete(`/api/cellars/${cellar.id}`).catch(() => {});
    await api.delete(`/api/cellars/${other.id}`).catch(() => {});
  }
});
