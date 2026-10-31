import { test, expect } from '@playwright/test';

// ux-ui.md 6.1 "Adding a bottle" — the application's main journey. Shared
// inventory, so the created item is always cleaned up via the API.
test('add a bottle through the form, see it in the list, then detect the duplicate', async ({ page }) => {
  const name = `E2E Bottle ${Date.now()}`;
  const producer = 'E2E Domaine';
  let id: string | undefined;

  try {
    await page.goto('/bottles');

    await page.getByTestId('inventory-add-button').click();
    const dialog = page.getByRole('dialog');

    await dialog.getByTestId('inventory-name-input').fill(name);
    await dialog.getByTestId('inventory-producer-input').fill(producer);
    await dialog.getByTestId('inventory-vintage-input').fill('2020');

    const created = page.waitForResponse(
      (r) => r.url().match(/\/api\/inventory\/?$/) !== null && r.request().method() === 'POST',
    );
    await dialog.getByTestId('inventory-form-submit').click();

    const res = await created;
    expect(res.status()).toBe(201);
    id = (await res.json())?.data?.id as string;
    expect(id).toBeTruthy();

    await expect(dialog).toBeHidden();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    // #471 §10.2: one card for the wine; a single bottle needs no stock line.
    const card = page.getByTestId('family-card').filter({ hasText: name });
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId('family-card-badge')).toHaveText('1');

    // Submitting the exact same entry again must be caught client-side
    // (FEAT-65) before a second row is created — the duplicate dialog opens
    // instead of a second POST.
    await page.getByTestId('inventory-add-button').click();
    const dialog2 = page.getByRole('dialog');
    await dialog2.getByTestId('inventory-name-input').fill(name);
    await dialog2.getByTestId('inventory-producer-input').fill(producer);
    await dialog2.getByTestId('inventory-vintage-input').fill('2020');
    await dialog2.getByTestId('inventory-form-submit').click();

    await expect(page.getByTestId('duplicate-increment')).toBeVisible();
    await page.getByTestId('duplicate-cancel').click();
    await expect(page.getByTestId('duplicate-increment')).toBeHidden();
  } finally {
    if (id) {
      await page.request.delete(`/api/inventory/${id}`);
    }
  }
});

// #683: the "Reference" button clears the fill level to null, which the API
// used to reject — no item could be saved afterwards, even after switching
// back to "In the cellar". Covers both outcomes of that toggle.
for (const owned of [false, true]) {
  test(`save a bottle after marking it as a reference${owned ? ' then back to owned' : ''}`, async ({ page }) => {
    const name = `E2E Reference ${owned ? 'owned' : 'ref'} ${Date.now()}`;
    let id: string | undefined;

    try {
      await page.goto('/bottles');
      await page.getByTestId('inventory-add-button').click();
      const dialog = page.getByRole('dialog');

      await dialog.getByTestId('inventory-name-input').fill(name);
      await dialog.getByTestId('inventory-producer-input').fill('E2E Domaine');
      await dialog.getByRole('button', { name: 'Afficher les compléments' }).click();
      await dialog.getByRole('button', { name: /Référence$/ }).click();
      if (owned) await dialog.getByRole('button', { name: /En cave$/ }).click();

      const created = page.waitForResponse(
        (r) => r.url().match(/\/api\/inventory\/?$/) !== null && r.request().method() === 'POST',
      );
      await dialog.getByTestId('inventory-form-submit').click();

      const res = await created;
      expect(res.status()).toBe(201);
      const item = (await res.json())?.data as { id: string; isOwned: boolean };
      id = item.id;
      expect(item.isOwned).toBe(owned);
      await expect(dialog).toBeHidden();

      // #471 (FEAT-101): a wine without any bottle in the cellar is hidden
      // from the list, shown by "Plus en cave" with "Plus de bouteille", and
      // always found by the search.
      const card = page.getByTestId('family-card').filter({ hasText: name });
      if (owned) {
        await expect(card).toBeVisible();
        await expect(card).not.toContainText('Plus de bouteille');
      } else {
        const goneFilter = page.getByRole('button', { name: 'Plus en cave', exact: true }).locator('visible=true');
        if ((await goneFilter.count()) === 0) await page.getByRole('button', { name: 'Filtrer', exact: true }).click();
        await goneFilter.first().click();
        await expect(card).toBeVisible();
        await expect(card.getByTestId('family-stock-line')).toContainText('Plus de bouteille');
        await goneFilter.first().click();
        await expect(card).toHaveCount(0);

        await page.goto(`/bottles?q=${encodeURIComponent(name)}`);
        await expect(card).toBeVisible();
      }
    } finally {
      if (id) {
        await page.request.delete(`/api/inventory/${id}`);
      }
    }
  });
}
