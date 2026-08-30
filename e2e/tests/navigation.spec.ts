import { test, expect } from '@playwright/test';
import { APP_ROUTES, collectPageProblems, bottlesNavLink } from './_helpers';

test.describe('navigation smoke', () => {
  test('every authenticated route renders without a client crash or 5xx', async ({ page }, testInfo) => {
    const problems = collectPageProblems(page, testInfo);

    for (const route of APP_ROUTES) {
      await test.step(route, async () => {
        const resp = await page.goto(route, { waitUntil: 'domcontentloaded' });
        expect(resp?.status(), `${route} document status`).toBeLessThan(400);
        // The app shell (sidebar nav) must be present on every route.
        await expect(bottlesNavLink(page)).toBeVisible();
        // The route rendered real content, not a blank / error screen.
        await expect(page.locator('main, [role="main"]').first()).not.toBeEmpty();
        await expect(
          page.getByText(/Application error|client-side exception|Une erreur inattendue/i),
        ).toHaveCount(0);
      });
    }

    await problems.dump();
    expect(problems.get(), problems.get().join('\n')).toEqual([]);
  });

  test('an unauthenticated visit is redirected to /login', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto('/bottles');
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });
});
