import { test, expect, type APIResponse } from '@playwright/test';
import { collectPageProblems } from './_helpers';

test('analytics page renders KPIs, the world map and the garde histogram', async ({ page }, testInfo) => {
  const problems = collectPageProblems(page, testInfo);

  const analyticsResponse = page.waitForResponse(
    (r) => r.url().includes('/api/analytics') && r.request().method() === 'GET',
  );
  await page.goto('/analytics-terroirs');
  const res = await analyticsResponse;
  expect(res.ok()).toBe(true);
  const stats = (await res.json())?.data;

  await expect(page.getByTestId('analytics-page-title')).toBeVisible();

  // The KPI cards reflect the figures the API actually returned — a
  // zeroed-totals bug (e.g. a date-filtering regression) must fail this,
  // not just "some digit exists somewhere on the page".
  await expect(page.getByTestId('kpi-total-valuation')).toContainText(String(stats.totalValuation));
  await expect(page.getByTestId('kpi-liquid-stock')).toContainText(String(stats.totalLiquidLiters));
  await expect(page.getByTestId('kpi-cigar-humidor')).toContainText(String(stats.cigarCount));
  await expect(page.getByTestId('kpi-urgent-degustation')).toContainText(String(stats.urgentDegustationCount));

  // The garde histogram actually rendered its bars, not just "some SVGs
  // exist" (which the sidebar icons alone satisfy).
  if ((stats.gardeHistogram?.length ?? 0) > 0) {
    await expect(page.locator('svg').first()).toBeVisible();
  }

  await problems.dump();
  expect(problems.get(), problems.get().join('\n')).toEqual([]);
});

// Recette n°5 ter of #847: "Résultats correspondant aux filtres" listed a wine
// drunk 13 times as 13 rows, though it was no longer in the cellar. One row per
// wine, only the wines still in stock, with how many are left.
test('the list under the map shows one row per wine in stock', async ({ page }) => {
  const api = page.request;
  const okData = async <T>(res: APIResponse): Promise<T> => {
    expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
    return (await res.json()).data as T;
  };
  const tag = `${Date.now()}-${Math.round(Math.random() * 1e4)}`;
  const kept = await okData<{ productId: string }>(await api.post('/api/inventory', {
    data: { category: 'wine', name: `E2E 5ter gardé ${tag}`, producer: 'Domaine E2E', vintage: 2018, region: 'Bordeaux', quantity: 21 },
  }));
  const gone = await okData<{ productId: string }>(await api.post('/api/inventory', {
    data: { category: 'wine', name: `E2E 5ter tout bu ${tag}`, producer: 'Domaine E2E', vintage: 2015, region: 'Bordeaux', quantity: 3 },
  }));
  await okData(await api.post('/api/products/bulk-drink', {
    data: { items: [{ productId: kept.productId, count: 13 }, { productId: gone.productId, count: 3 }] },
  }));

  try {
    await page.goto('/analytics-terroirs');
    const rows = page.getByRole('button').filter({ has: page.getByTestId('map-asset-stock') });
    const keptRows = rows.filter({ hasText: `E2E 5ter gardé ${tag}` });
    await expect(keptRows).toHaveCount(1);
    await expect(keptRows.getByTestId('map-asset-stock')).toHaveText(/^8\s+bouteilles$/);
    await expect(rows.filter({ hasText: `E2E 5ter tout bu ${tag}` })).toHaveCount(0);
  } finally {
    for (const id of [kept.productId, gone.productId]) await api.delete(`/api/products/${id}`);
  }
});
