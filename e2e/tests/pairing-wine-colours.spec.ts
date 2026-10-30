import { test, expect } from '@playwright/test';

/**
 * #703: bottles store their colour in English ('red', 'white') while the
 * dish → bottle pairing catalog was keyed in French, so the pairing tab never
 * suggested a red or a white wine ("Viande" and "agneau" found nothing).
 */
test('food pairing suggests the red and white wines in stock', async ({ page }) => {
  const api = page.request;
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e4)}`;
  const red = `E2E #703 rouge ${stamp}`;
  const white = `E2E #703 blanc ${stamp}`;
  const ids: string[] = [];
  try {
    for (const [name, color] of [[red, 'red'], [white, 'white']]) {
      const res = await api.post('/api/inventory', {
        data: { category: 'wine', name, producer: 'E2E Domaine', color },
      });
      expect(res.status(), await res.text()).toBe(201);
      ids.push((await res.json()).data.id as string);
    }

    await page.goto('/cellar-journal');
    await page.getByRole('tab', { name: 'Accords mets & bouteilles' }).click();

    // The quick "Viande" suggestion.
    await page.getByRole('button', { name: 'Viande', exact: true }).click();
    await expect(page.getByText(red)).toBeVisible();
    await expect(page.getByText(white)).toHaveCount(0);

    const search = page.getByLabel('Plat ou type de met');
    await search.fill('agneau');
    await expect(page.getByText(red)).toBeVisible();

    await search.fill('poisson');
    await expect(page.getByText(white)).toBeVisible();
    await expect(page.getByText(red)).toHaveCount(0);
  } finally {
    for (const id of ids) await api.delete(`/api/inventory/${id}`).catch(() => {});
  }
});
