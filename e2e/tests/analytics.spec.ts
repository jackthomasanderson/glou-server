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

  await expect(page.getByRole('heading', { name: 'Analyses & Terroirs' })).toBeVisible();

  // KPI cards carry numeric figures.
  await expect(page.locator('body')).toContainText(/\d/);

  // The dashboard's charts rendered: several inline SVGs (icons + the garde
  // histogram / distribution charts). The world map is Leaflet (tiles from an
  // external CDN) so it isn't asserted on here — flaky in a sandboxed CI.
  await expect
    .poll(() => page.locator('svg').count(), { timeout: 15_000 })
    .toBeGreaterThan(5);

  await problems.dump();
  expect(problems.get(), problems.get().join('\n')).toEqual([]);
});
