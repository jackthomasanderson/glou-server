import { test, expect, type Locator } from '@playwright/test';

/**
 * #574: the first-run wizard sat above everything HeroUI opens in a portal.
 * The add form and the error toasts rendered underneath it: invisible and
 * unclickable, in the very first minute of a new member.
 *
 * `toBeVisible()` cannot see that: a covered element is still "visible". Each
 * layer opened from the wizard is therefore checked with `elementFromPoint`,
 * which returns whatever is really on top at that spot.
 *
 * The suite's user has already completed onboarding, so the wizard is
 * reopened on demand (`?onboarding=1`, the profile page's link): same
 * component, same layers. Registering a second account is not possible,
 * registration being closed once the admin exists.
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

async function isOnTop(locator: Locator): Promise<boolean> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit !== null && (hit === el || el.contains(hit));
  });
}

async function expectOnTop(locator: Locator, what: string) {
  await expect(locator).toBeVisible();
  await expect.poll(() => isOnTop(locator), { message: `${what} is covered by another layer` }).toBe(true);
}

test('first-run wizard: an error toast and the add form show above the wizard', async ({ page }) => {
  const name = `E2E Wizard ${stamp()}`;
  let cellarId: string | undefined;
  let itemId: string | undefined;

  try {
    // A cellar makes the wizard resume at "How do you want to add your assets?".
    const cellarRes = await page.request.post('/api/cellars', {
      data: { name: `E2E #574 ${stamp()}`, columns: 3, rows: 3 },
    });
    expect(cellarRes.ok(), await cellarRes.text()).toBe(true);
    cellarId = (await cellarRes.json())?.data?.id as string;

    await page.goto('/bottles?onboarding=1');
    const wizard = page.getByRole('dialog', { name: 'Assistant de démarrage' });
    await expect(wizard.getByText('Comment souhaitez-vous ajouter vos actifs ?')).toBeVisible();

    // 1. "Create a cellar" fails: its error toast must not hide behind the wizard.
    await wizard.getByRole('button', { name: 'Retour' }).click();
    await wizard.getByPlaceholder('Ex : Cave à vin').fill('E2E cave refusée');
    await page.route('**/api/cellars', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"INTERNAL_ERROR"}' })
        : route.continue(),
    );
    await wizard.getByRole('button', { name: 'Créer la cave' }).click();
    const errorToast = page.getByText('Impossible de créer la cave', { exact: true });
    await expectOnTop(errorToast, 'the "cannot create the cellar" toast');
    await page.unroute('**/api/cellars');
    // Error toasts stay until closed (ux-ui.md 5.3); on a phone this one would
    // sit over the top of the full-screen add form opened next.
    await page.getByRole('button', { name: 'closeButton' }).click();
    await expect(errorToast).toBeHidden();

    // 2. Manual entry: the add form opens on top and can be saved.
    await wizard.getByRole('button', { name: 'Passer cette étape' }).click();
    await wizard.getByText('Ajout Manuel', { exact: true }).click();
    await wizard.getByRole('button', { name: 'Ajouter un actif' }).click();

    const nameInput = page.getByTestId('inventory-name-input');
    await expectOnTop(nameInput, 'the add form');
    await nameInput.fill(name);
    await page.getByTestId('inventory-producer-input').fill('E2E Domaine');
    const created = page.waitForResponse(
      (r) => r.url().match(/\/api\/inventory\/?$/) !== null && r.request().method() === 'POST',
    );
    // click() itself refuses a button covered by another layer.
    await page.getByTestId('inventory-form-submit').click();
    const res = await created;
    expect(res.status()).toBe(201);
    itemId = (await res.json())?.data?.id as string;

    await expect(nameInput).toBeHidden();
    await expect(wizard.getByText('1 actif ajouté pour l\'instant')).toBeVisible();

    // 3. The wizard carries on to its summary, then hands over to the app.
    await wizard.getByRole('button', { name: 'Terminer l\'ajout' }).click();
    await expect(wizard.getByText('1 actif ajouté à votre inventaire')).toBeVisible();
    await wizard.getByRole('button', { name: 'Accéder au tableau de bord' }).click();
    await expect(wizard).toBeHidden();
  } finally {
    if (itemId) await page.request.delete(`/api/inventory/${itemId}`);
    if (cellarId) await page.request.delete(`/api/cellars/${cellarId}`);
  }
});
