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
 * #686: some wizard steps are taller than a phone's screen. Every button must
 * then be brought on screen by scrolling, whole, and be the element really
 * under the finger. Scrolling a button into view also scrolls an
 * `overflow: hidden` card sideways, which a finger cannot do: no box between
 * the button and the dialog may be wider than its own width.
 */
async function expectReachable(locator: Locator, what: string) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator, `${what} cannot be scrolled on screen`).toBeInViewport({ ratio: 0.95 });
  const sideways = await locator.evaluate((el) => {
    const dialog = el.closest('[role="dialog"]');
    for (let box = el.parentElement; box; box = box.parentElement) {
      if (box.scrollLeft !== 0 || box.scrollWidth > box.clientWidth + 1) return true;
      if (box === dialog) break;
    }
    return false;
  });
  expect(sideways, `${what} sits in a row wider than the screen`).toBe(false);
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

test('first-run wizard on a phone: every step can be scrolled to its buttons, up to a confirmed file import (#686)', async ({ page, isMobile }) => {
  // Phones only: the desktop window has room for every step. One journey, one
  // page load: the suite shares the API's per-address rate limit.
  test.skip(!isMobile, 'phone layout');
  const id = stamp();
  let cellarId: string | undefined;

  try {
    // A cellar makes the wizard resume at "How do you want to add your assets?".
    const cellarRes = await page.request.post('/api/cellars', {
      data: { name: `E2E #686 ${id}`, columns: 3, rows: 3 },
    });
    expect(cellarRes.ok(), await cellarRes.text()).toBe(true);
    cellarId = (await cellarRes.json())?.data?.id as string;

    // 1. A 375 px wide phone (iPhone SE class): "Back" | "Skip this step" +
    // "Create cellar" did not fit side by side in the card.
    await page.setViewportSize({ width: 375, height: 553 });
    await page.goto('/bottles?onboarding=1');
    const wizard = page.getByRole('dialog', { name: 'Assistant de démarrage' });
    const methodTitle = wizard.getByText('Comment souhaitez-vous ajouter vos actifs ?');
    const close = wizard.getByRole('button', { name: 'Fermer' });
    const back = wizard.getByRole('button', { name: 'Retour' });
    const skip = wizard.getByRole('button', { name: 'Passer cette étape' });
    const createCellar = wizard.getByRole('button', { name: 'Créer la cave' });
    await expect(methodTitle).toBeVisible();
    await back.click();
    // A name enables "Create cellar" (a disabled HeroUI button lets taps through).
    await wizard.getByPlaceholder('Ex : Cave à vin').fill('E2E cave non créée');
    await expectReachable(back, 'Back (cellar step, 375 px)');
    await expectReachable(skip, 'Skip this step (cellar step, 375 px)');
    await expectReachable(createCellar, 'Create cellar (375 px)');

    // 2. The same phone held in landscape: even the short steps are taller
    // than the screen. The header's exit sits at the top, the step's buttons
    // at the bottom. (With a recognition service the method step gets a third
    // card and is taller still; the CI stack has none.)
    await page.setViewportSize({ width: 667, height: 375 });
    await expectReachable(close, 'the close button (cellar step, landscape)');
    await expectReachable(back, 'Back (cellar step, landscape)');
    await expectReachable(createCellar, 'Create cellar (landscape)');
    await expectReachable(skip, 'Skip this step (cellar step, landscape)');
    // Scrolled down to its buttons, the cellar step hands over to a step that
    // starts at its top.
    const scrollTop = () => wizard.evaluate((el) => el.scrollTop);
    expect(await scrollTop()).toBeGreaterThan(0);
    await skip.click();
    await expect(methodTitle).toBeVisible();
    await expect.poll(scrollTop, { message: 'the method step opens scrolled down' }).toBe(0);
    const importCard = wizard.getByText('Import Fichier', { exact: true });
    await expectReachable(close, 'the close button (method step, landscape)');
    await expectReachable(importCard, 'the file import card (landscape)');
    await expectReachable(back, 'Back (method step, landscape)');
    await expectReachable(skip, 'Skip this step (method step, landscape)');

    // 3. Back to the 375 px phone. The preview of a cellar file is taller than
    // its screen, as it is than an iPhone 14's: "Confirm import" fell below it.
    // Six rows fill the preview list.
    await page.setViewportSize({ width: 375, height: 553 });
    await importCard.click();
    await expect(wizard.getByText('Import CSV', { exact: true })).toBeVisible();
    await expect.poll(scrollTop, { message: 'the file import step opens scrolled down' }).toBe(0);
    const csv = [
      'Nom;Producteur;Catégorie;Millésime',
      ...Array.from({ length: 6 }, (_, i) => `Wizard ${i + 1} ${id};Domaine E2E;Vin;${2010 + i}`),
    ].join('\n');
    await wizard.locator('input[type="file"]').setInputFiles({
      name: 'cave.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8'),
    });
    await expect(wizard.getByText('6 lignes valides')).toBeVisible();
    expect(
      await wizard.evaluate((el) => el.scrollHeight > el.clientHeight),
      'the preview fits the screen, so this check would not go through scrolling',
    ).toBe(true);
    await expectReachable(close, 'the close button (file preview)');
    await expectReachable(back, 'Back (file preview)');
    const confirm = wizard.getByRole('button', { name: 'Confirmer l\'import' });
    await expectReachable(confirm, 'Confirm import');
    const imported = page.waitForResponse(
      (r) => r.url().includes('/api/import/csv/confirm') && r.request().method() === 'POST',
    );
    await confirm.click();
    expect((await imported).ok()).toBe(true);

    await expect(wizard.getByText('6 actifs ajoutés à votre inventaire')).toBeVisible();
    const finish = wizard.getByRole('button', { name: 'Accéder au tableau de bord' });
    await expectReachable(finish, 'Go to the dashboard');
    await finish.click();
    await expect(wizard).toBeHidden();
  } finally {
    const items = await page.request.get('/api/inventory');
    if (items.ok()) {
      for (const item of (await items.json()).data as Array<{ id: string; name: string }>) {
        if (item.name.includes(id)) await page.request.delete(`/api/inventory/${item.id}`).catch(() => {});
      }
    }
    if (cellarId) await page.request.delete(`/api/cellars/${cellarId}`);
  }
});
