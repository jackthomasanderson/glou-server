import { test, expect } from '@playwright/test';

// Regression guard: the sidebar (and pages in general) must honour the user's
// interface-language preference — cf. the "bottles/cigars pages ignored the
// language preference" fix (commit 69ddef8). The language change goes through
// the API the profile page uses; this spec asserts the UI actually reflects it.
test('the app honours the interface-language preference after a reload', async ({ page }) => {
  const bottlesNav = page.locator('a[href="/bottles"]').first();

  await page.goto('/bottles');
  await expect(bottlesNav).toHaveText(/Bouteilles/);

  try {
    const toEn = await page.request.patch('/api/user/preferences', { data: { language: 'EN' } });
    expect(toEn.ok()).toBe(true);

    await page.goto('/bottles');
    await expect(bottlesNav).toHaveText(/Bottles/);
    await expect(page.locator('a[href="/cigars"]').first()).toHaveText(/Cigars/);

    await page.reload();
    await expect(bottlesNav).toHaveText(/Bottles/);
  } finally {
    // Always hand the app back in French for the rest of the suite.
    await page.request.patch('/api/user/preferences', { data: { language: 'FR' } });
  }

  await page.goto('/bottles');
  await expect(bottlesNav).toHaveText(/Bouteilles/);
});
