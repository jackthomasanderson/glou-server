import { test, expect, type Page } from '@playwright/test';
import { creds, bottlesNavLink } from './_helpers';

// #584: when a browser blocks site data (Chrome "Sites can't save data",
// Firefox "block all cookies"), merely reading `window.localStorage` or
// `window.sessionStorage` throws. The sign-in page used to fail to load at
// all. Playwright cannot switch that browser setting, so the same exception
// is raised by replacing both getters before any page script runs.
test.use({ storageState: { cookies: [], origins: [] } });

async function blockWebStorage(page: Page) {
  await page.addInitScript(() => {
    for (const name of ['localStorage', 'sessionStorage']) {
      Object.defineProperty(window, name, {
        configurable: true,
        get() {
          throw new DOMException(`Failed to read the '${name}' property from 'Window': Access is denied for this document.`, 'SecurityError');
        },
      });
    }
  });
}

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test('with site data blocked, the sign-in page loads', async ({ page }) => {
  await blockWebStorage(page);
  const errors = collectPageErrors(page);

  await page.goto('/login');
  // The block really is in place in the page.
  expect(await page.evaluate(() => {
    try { void window.localStorage; return false; } catch { return true; }
  })).toBe(true);

  await expect(page.getByRole('textbox', { name: 'Identifiant ou email' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  await expect(page.getByText(/Application error/i)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('with web storage blocked, a signed-in member still gets the app', async ({ page }) => {
  await blockWebStorage(page);
  const errors = collectPageErrors(page);
  const c = creds();

  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Identifiant ou email' }).fill(c.username);
  await page.getByRole('textbox', { name: /Mot de passe/ }).fill(c.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page).toHaveURL(/\/(bottles|$)/);
  await expect(bottlesNavLink(page)).toBeVisible();
  await expect(page.getByText(/Application error/i)).toHaveCount(0);
  expect(errors).toEqual([]);
});
