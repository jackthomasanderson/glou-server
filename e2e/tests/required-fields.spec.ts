import { test, expect } from '@playwright/test';

/**
 * #657: in a real browser, a Save clicked with a required field empty must
 * show that field in red with its message (the browser's own bubble used to
 * block the submit first, jsdom never showed it). Nothing is created.
 */
test('the bottle form and "Add a wish" flag an empty name on Save', async ({ page }) => {
  const required = 'Ce champ est obligatoire';

  await page.goto('/bottles');
  await page.getByTestId('inventory-add-button').click();
  const bottle = page.getByRole('dialog');
  await bottle.getByTestId('inventory-form-submit').click();
  await expect(bottle.getByText(required).first()).toBeVisible();
  await expect(bottle.getByTestId('inventory-name-input')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText("Complétez les champs obligatoires avant d'enregistrer")).toBeVisible();
  await bottle.getByRole('button', { name: 'Annuler' }).click();

  await page.goto('/wishlist-budget');
  await page.getByTestId('wishlist-create-button').first().click();
  const wish = page.getByRole('dialog');
  await wish.getByTestId('wishlist-form-submit').click();
  await expect(wish.getByText(required)).toBeVisible();
  await expect(wish.getByTestId('wishlist-name-input')).toHaveAttribute('aria-invalid', 'true');
});
