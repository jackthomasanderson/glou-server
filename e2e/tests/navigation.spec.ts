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

  // Recette #471 (lot RD point 6): the counter of the active entry (Cigares,
  // Caves) was white on the light highlight of that entry.
  test('the counter of the active menu entry stays readable', async ({ page }) => {
    await page.goto('/cellars');
    const count = page.getByRole('navigation').getByRole('button', { name: /^Caves/ }).getByTestId('nav-count');
    await expect(count).toBeVisible();
    const contrast = await count.evaluate((element) => {
      const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
      const luminance = ([r, g, b]: number[]) => {
        const [R, G, B] = [r, g, b].map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
        return 0.2126 * R + 0.7152 * G + 0.0722 * B;
      };
      const style = getComputedStyle(element);
      const background = rgb(style.backgroundColor);
      if (background.length === 4 && background[3] < 1) return 0;
      const [a, b] = [luminance(rgb(style.color)), luminance(background)].sort((x, y) => y - x);
      return (a + 0.05) / (b + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });
});
