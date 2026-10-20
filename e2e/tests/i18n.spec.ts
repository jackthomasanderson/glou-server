import { test, expect } from '@playwright/test';

// Regression guard: the sidebar (and pages in general) must honour the user's
// interface-language preference — cf. the "bottles/cigars pages ignored the
// language preference" fix (commit 69ddef8). The language change goes through
// the API the profile page uses; this spec asserts the UI actually reflects it.
//
// ISSUE_434: the sidebar's single "bottles" entry became 3 category
// shortcuts; this now checks the "wine" one specifically rather than a
// link that no longer exists (`a[href="/bottles"]` with "Actifs"/"Assets").
test('the app honours the interface-language preference after a reload', async ({ page }) => {
  const wineNav = page.locator('a[href="/bottles?category=wine"]').first();

  await page.goto('/bottles');
  await expect(wineNav).toHaveText(/Vins/);

  try {
    const toEn = await page.request.patch('/api/user/preferences', { data: { language: 'EN' } });
    expect(toEn.ok()).toBe(true);

    await page.goto('/bottles');
    await expect(wineNav).toHaveText(/Wines/);
    await expect(page.locator('a[href="/cigars"]').first()).toHaveText(/Cigars/);

    await page.reload();
    await expect(wineNav).toHaveText(/Wines/);
  } finally {
    // Always hand the app back in French for the rest of the suite.
    await page.request.patch('/api/user/preferences', { data: { language: 'FR' } });
  }

  await page.goto('/bottles');
  await expect(wineNav).toHaveText(/Vins/);
});
