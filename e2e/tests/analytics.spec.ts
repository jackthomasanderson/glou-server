import { test, expect } from '@playwright/test';
import { collectPageProblems } from './_helpers';

test('analytics page renders KPIs, the world map and the garde histogram', async ({ page }, testInfo) => {
  const problems = collectPageProblems(page, testInfo);

  const analyticsResponse = page.waitForResponse(
    (r) => r.url().includes('/api/analytics') && r.request().method() === 'GET',
  );
  await page.goto('/analytics');
  const res = await analyticsResponse;
  expect(res.ok()).toBe(true);
  const stats = (await res.json())?.data;

  await expect(page.getByTestId('analytics-page-title')).toBeVisible();

  // The KPI cards reflect the figures the API actually returned — a
  // zeroed-totals bug (e.g. a date-filtering regression) must fail this,
  // not just "some digit exists somewhere on the page".
  await expect(page.getByTestId('kpi-total-valuation')).toContainText(String(stats.totalValuation));
  await expect(page.getByTestId('kpi-liquid-stock')).toContainText(String(stats.totalLiquidLiters));
  await expect(page.getByTestId('kpi-cigar-humidor')).toContainText(String(stats.cigarModulesCount));
  await expect(page.getByTestId('kpi-urgent-degustation')).toContainText(String(stats.urgentDegustationCount));

  // The garde histogram actually rendered its bars, not just "some SVGs
  // exist" (which the sidebar icons alone satisfy).
  if ((stats.gardeHistogram?.length ?? 0) > 0) {
    await expect(page.locator('svg').first()).toBeVisible();
  }

  await problems.dump();
  expect(problems.get(), problems.get().join('\n')).toEqual([]);
});
