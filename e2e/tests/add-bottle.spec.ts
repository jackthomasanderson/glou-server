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
