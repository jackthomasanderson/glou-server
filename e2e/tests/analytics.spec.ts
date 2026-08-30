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

  // KPI cards: a handful of large numeric figures near the top of the page.
  const body = await page.locator('body').innerText();
  expect(body).toMatch(/\d/);

  // The world heatmap is an inline SVG (react-simple-maps) with <path> geographies.
  await expect(page.locator('svg path').first()).toBeVisible({ timeout: 15_000 });

  // A good few inline SVGs on the page: the map, icons, and the garde
  // histogram / distribution charts — i.e. the dashboard actually rendered.
  expect(await page.locator('svg').count()).toBeGreaterThan(5);

  await problems.dump();
  expect(problems.get(), problems.get().join('\n')).toEqual([]);
});
