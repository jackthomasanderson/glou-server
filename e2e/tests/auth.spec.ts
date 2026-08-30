import { test, expect } from '@playwright/test';
import { creds, bottlesNavLink } from './_helpers';

// These specs manage their own auth state — start from a clean context.
test.use({ storageState: { cookies: [], origins: [] } });

test('login page renders its form', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('textbox', { name: 'Identifiant ou email' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /Mot de passe/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
});

test('wrong credentials show an error and stay on /login', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Identifiant ou email' }).fill('nobody');
  await page.getByRole('textbox', { name: /Mot de passe/ }).fill('wrong-password-123');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText(/incorrect|invalide|erreur/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test('a valid login lands in the app, and logout returns to /login', async ({ page }) => {
  const c = creds();
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Identifiant ou email' }).fill(c.username);
  await page.getByRole('textbox', { name: /Mot de passe/ }).fill(c.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page).toHaveURL(/\/(bottles|$)/);
  await expect(bottlesNavLink(page)).toBeVisible();

  // Log out via the API the app itself uses, then confirm the guard kicks in.
  await page.request.post('/api/auth/logout');
  await page.goto('/bottles');
  await expect(page).toHaveURL(/\/login/);
});

test('the register and forgot-password pages are reachable', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: /S'inscrire/ }).click();
  await expect(page).toHaveURL(/\/register/);
  await expect(page.getByRole('button', { name: /inscrire|créer/i })).toBeVisible();

  // The login page only shows the forgot-password link when SMTP is
  // configured, but the page itself must always render.
  await page.goto('/forgot-password');
  await expect(page).toHaveURL(/\/forgot-password/);
  await expect(page.getByRole('heading', { name: /Récupération/ })).toBeVisible();
});
