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

/**
 * #686: the wizard is taller than a phone's screen at some steps. Every button
 * must then be brought on screen by scrolling, whole (a card clipping its
 * right edge counts as cut off), and be the element really under the finger.
 */
async function expectReachable(locator: Locator, what: string) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator, `${what} cannot be scrolled on screen`).toBeInViewport({ ratio: 0.95 });
  await expectOnTop(locator, what);
}

test('first-run wizard: an error toast, the add form and the duplicate choice show above the wizard', async ({ page }) => {
  const name = `E2E Wizard ${stamp()}`;
  let cellarId: string | undefined;
  let itemId: string | undefined;
  let secondItemId: string | undefined;

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
    // A real refusal rather than a mocked one: the API caps a cellar name at
    // 100 characters, the wizard's field does not (a mocked route never caught
    // this request in WebKit, and the cellar got created).
    await wizard.getByPlaceholder('Ex : Cave à vin').fill('E2E cave refusée '.padEnd(101, 'x'));
    const refused = page.waitForResponse(
      (r) => r.url().match(/\/api\/cellars\/?$/) !== null && r.request().method() === 'POST',
    );
    await wizard.getByRole('button', { name: 'Créer la cave' }).click();
    expect((await refused).status()).toBe(400);
    const errorToast = page.getByText('Impossible de créer la cave', { exact: true });
    await expectOnTop(errorToast, 'the "cannot create the cellar" toast');
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

    // 3. A second bottle of the same wine (AUDIT_006): saving it used to do
    // nothing at all. The duplicate choice now shows, on top.
    await wizard.getByRole('button', { name: 'Ajouter un actif' }).click();
    await nameInput.fill(name);
    await page.getByTestId('inventory-producer-input').fill('E2E Domaine');
    await page.getByTestId('inventory-form-submit').click();
    const createAnyway = page.getByTestId('duplicate-create-anyway');
    await expectOnTop(createAnyway, 'the duplicate choice');
    const createdAgain = page.waitForResponse(
      (r) => r.url().match(/\/api\/inventory\/?$/) !== null && r.request().method() === 'POST',
    );
    await createAnyway.click();
    const resAgain = await createdAgain;
    expect(resAgain.status()).toBe(201);
    secondItemId = (await resAgain.json())?.data?.id as string;
    await expect(nameInput).toBeHidden();
    await expect(wizard.getByText('2 actifs ajoutés pour l\'instant')).toBeVisible();

    // 4. The wizard carries on to its summary, then hands over to the app.
    await wizard.getByRole('button', { name: 'Terminer l\'ajout' }).click();
    await expect(wizard.getByText('2 actifs ajoutés à votre inventaire')).toBeVisible();
    await wizard.getByRole('button', { name: 'Accéder au tableau de bord' }).click();
    await expect(wizard).toBeHidden();
  } finally {
    if (itemId) await page.request.delete(`/api/inventory/${itemId}`);
    if (secondItemId) await page.request.delete(`/api/inventory/${secondItemId}`);
    if (cellarId) await page.request.delete(`/api/cellars/${cellarId}`);
  }
});

test('first-run wizard on a phone: a file import can be confirmed once its preview shows (#686)', async ({ page }) => {
  // Run at each project's own screen: an iPhone 14 in mobile-safari, where
  // the preview of a ten-row file pushed "Confirm import" below the screen
  // with no way to scroll it back.
  const id = stamp();
  let cellarId: string | undefined;

  try {
    const cellarRes = await page.request.post('/api/cellars', {
      data: { name: `E2E #686 ${id}`, columns: 3, rows: 3 },
    });
    expect(cellarRes.ok(), await cellarRes.text()).toBe(true);
    cellarId = (await cellarRes.json())?.data?.id as string;

    await page.goto('/bottles?onboarding=1');
    const wizard = page.getByRole('dialog', { name: 'Assistant de démarrage' });
    await expect(wizard.getByText('Comment souhaitez-vous ajouter vos actifs ?')).toBeVisible();
    await wizard.getByText('Import Fichier', { exact: true }).click();

    const csv = [
      'Nom;Producteur;Catégorie;Millésime',
      ...Array.from({ length: 10 }, (_, i) => `Wizard ${i + 1} ${id};Domaine E2E;Vin;${2010 + i}`),
    ].join('\n');
    await wizard.locator('input[type="file"]').setInputFiles({
      name: 'cave.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8'),
    });
    await expect(wizard.getByText('10 lignes valides')).toBeVisible();

    await expectReachable(wizard.getByRole('button', { name: 'Fermer' }), 'the close button');
    await expectReachable(wizard.getByRole('button', { name: 'Retour' }), 'Back');
    const confirm = wizard.getByRole('button', { name: 'Confirmer l\'import' });
    await expectReachable(confirm, 'Confirm import');
    const imported = page.waitForResponse(
      (r) => r.url().includes('/api/import/csv/confirm') && r.request().method() === 'POST',
    );
    await confirm.click();
    expect((await imported).ok()).toBe(true);

    await expect(wizard.getByText('10 actifs ajoutés à votre inventaire')).toBeVisible();
    const finish = wizard.getByRole('button', { name: 'Accéder au tableau de bord' });
    await expectReachable(finish, 'Go to the dashboard');
    await finish.click();
    await expect(wizard).toBeHidden();
  } finally {
    const items = await page.request.get('/api/inventory');
    if (items.ok()) {
      for (const item of ((await items.json()).data as Array<{ id: string; name: string }>)) {
        if (item.name.includes(id)) await page.request.delete(`/api/inventory/${item.id}`).catch(() => {});
      }
    }
    if (cellarId) await page.request.delete(`/api/cellars/${cellarId}`);
  }
});

test('first-run wizard on a small phone: every button of the cellar and method steps can be reached (#686)', async ({ page }) => {
  // A 375 px wide phone with Safari's bars (iPhone SE class): the method step
  // is taller than the screen, and the cellar step's three buttons are wider
  // than the card. With a recognition service the method step has a third
  // card and is taller still; the CI stack has none, the short screen stands in.
  await page.setViewportSize({ width: 375, height: 553 });
  let cellarId: string | undefined;

  try {
    const cellarRes = await page.request.post('/api/cellars', {
      data: { name: `E2E #686 small ${stamp()}`, columns: 3, rows: 3 },
    });
    expect(cellarRes.ok(), await cellarRes.text()).toBe(true);
    cellarId = (await cellarRes.json())?.data?.id as string;

    await page.goto('/bottles?onboarding=1');
    const wizard = page.getByRole('dialog', { name: 'Assistant de démarrage' });
    await expect(wizard.getByText('Comment souhaitez-vous ajouter vos actifs ?')).toBeVisible();

    // Method choice: the header's exit at the top, Back and Skip at the bottom.
    await expectReachable(wizard.getByRole('button', { name: 'Fermer' }), 'the close button (method step)');
    await expectReachable(wizard.getByRole('button', { name: 'Passer cette étape' }), 'Skip this step (method step)');
    const back = wizard.getByRole('button', { name: 'Retour' });
    await expectReachable(back, 'Back (method step)');
    await back.click();

    // Cellar step: "Back" | "Skip this step" + "Create cellar" on one row
    // overflowed a 375 px card. A name enables "Create cellar" (a disabled
    // HeroUI button lets taps through, so it would never be "on top").
    await wizard.getByPlaceholder('Ex : Cave à vin').fill('E2E cave non créée');
    await expectReachable(wizard.getByRole('button', { name: 'Fermer' }), 'the close button (cellar step)');
    await expectReachable(wizard.getByRole('button', { name: 'Retour' }), 'Back (cellar step)');
    await expectReachable(wizard.getByRole('button', { name: 'Créer la cave' }), 'Create cellar');
    const skip = wizard.getByRole('button', { name: 'Passer cette étape' });
    await expectReachable(skip, 'Skip this step (cellar step)');
    await skip.click();
    await expect(wizard.getByText('Comment souhaitez-vous ajouter vos actifs ?')).toBeVisible();

    const close = wizard.getByRole('button', { name: 'Fermer' });
    await expectReachable(close, 'the close button');
    await close.click();
    await expect(wizard).toBeHidden();
  } finally {
    if (cellarId) await page.request.delete(`/api/cellars/${cellarId}`);
  }
});
