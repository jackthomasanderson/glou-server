import { test, expect } from '@playwright/test';
import { creds } from './_helpers';

/**
 * #582: the server answers a wrong password or PIN with 401, which the lock
 * screen never turned into a message: the button spun, then nothing, and
 * the app looked frozen. Against the real API, since the bug sat between the
 * HTTP answer and the screen.
 */
test('a wrong password on the lock screen says so and clears the field', async ({ page }) => {
  await page.goto('/bottles');
  await page.getByRole('button', { name: 'Verrouiller', exact: true }).click();

  const lock = page.getByRole('dialog', { name: 'Application verrouillée' });
  await expect(lock).toBeVisible();
  const password = lock.locator('input[type="password"]');
  const unlock = lock.getByRole('button', { name: 'Déverrouiller', exact: true });

  await password.fill('definitely-not-the-password');
  await unlock.click();
  await expect(lock.getByRole('alert')).toHaveText('Mot de passe ou code PIN incorrect.');
  await expect(password).toHaveValue('');

  // The right password still unlocks.
  await password.fill(creds().password);
  await unlock.click();
  await expect(lock).toBeHidden();
});
