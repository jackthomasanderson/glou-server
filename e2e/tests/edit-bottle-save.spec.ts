import { test, expect, type Page, type Locator, type APIRequestContext } from '@playwright/test';

/**
 * #572: saving the edit form sent the whole bottle as it was when the form
 * opened. A change made meanwhile by someone else was overwritten without a
 * word, and the API locked every field it received and dropped its scan/import
 * source. The form now sends only the changed fields plus the version it
 * started from, and the API refuses (409) a save made from an old version.
 *
 * #643: the name was greyed out when editing, so a misread name could not be
 * corrected.
 */

async function createBottle(api: APIRequestContext, name: string) {
  const created = await api.post('/api/inventory', {
    data: { category: 'wine', name, producer: 'E2E Domaine', vintage: 2015, region: 'Bourgogne', purchasePrice: 20 },
  });
  expect(created.status(), await created.text()).toBe(201);
  return (await created.json()).data as { id: string; updatedAt: string };
}

async function getBottle(api: APIRequestContext, id: string) {
  return (await (await api.get(`/api/inventory/${id}`)).json()).data as Record<string, unknown>;
}

/** Opens the bottle's detail window from the global search. */
async function openDetail(page: Page, name: string) {
  await page.goto('/cellars');
  const search = page.getByRole('combobox').filter({ visible: true }).first();
  await search.fill(name);
  await expect(page.getByRole('option', { name: new RegExp(name) }).first()).toBeVisible();
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(page.locator('#inventory-detail-title')).toHaveText(name);
  return page.getByRole('dialog').filter({ has: page.locator('#inventory-detail-title') });
}

/** Opens the bottle's edit form, from its detail window unless one is given. */
async function openEditForm(page: Page, name: string, detail?: Locator) {
  const from = detail ?? await openDetail(page, name);
  // The detail window's own button: the cards behind have "Modifier" ones too.
  await from.getByRole('button', { name: 'Modifier', exact: true }).click();
  // The form window: the detail one may still be closing.
  const dialog = page.getByRole('dialog').filter({ has: page.getByTestId('inventory-form-submit') });
  await expect(dialog.getByTestId('inventory-name-input')).toHaveValue(name);
  return dialog;
}

function patchOf(page: Page, id: string) {
  return page.waitForResponse(
    (r) => r.url().endsWith(`/api/inventory/${id}`) && r.request().method() === 'PATCH',
  );
}

test('a bottle name can be corrected when editing, without suggestions (#643)', async ({ page }) => {
  const api = page.request;
  const name = `E2E #643 ${Date.now()} Vougot`;
  const fixed = name.replace('Vougot', 'Vougeot');
  const { id } = await createBottle(api, name);

  try {
    const dialog = await openEditForm(page, name);
    const nameInput = dialog.getByTestId('inventory-name-input');
    await expect(nameInput).toBeEnabled();

    // A start of its own name: in the creation form, this bottle would be
    // proposed at once (and picking it would overwrite producer, vintage...).
    await nameInput.fill(name.replace(' Vougot', ''));
    await expect(dialog.locator('[role="option"]')).toHaveCount(0);

    await nameInput.fill(fixed);
    const saved = patchOf(page, id);
    await dialog.getByTestId('inventory-form-submit').click();
    const res = await saved;
    expect(res.status(), await res.text()).toBe(200);
    expect(Object.keys(res.request().postDataJSON() as object).sort()).toEqual(['expectedUpdatedAt', 'name']);
    await expect(dialog).toBeHidden();

    expect((await getBottle(api, id)).name).toBe(fixed);
  } finally {
    await api.delete(`/api/inventory/${id}`).catch(() => {});
  }
});

test('changing only the price sends only the price and locks nothing else (#572)', async ({ page }) => {
  const api = page.request;
  const name = `E2E #572 price ${Date.now()}`;
  const created = await createBottle(api, name);

  try {
    const dialog = await openEditForm(page, name);
    await dialog.getByRole('button', { name: 'Afficher les compléments' }).click();
    const price = dialog.getByLabel("Prix d'achat (€)");
    await price.fill('');
    await price.pressSequentially('25');

    const saved = patchOf(page, created.id);
    await dialog.getByTestId('inventory-form-submit').click();
    const res = await saved;
    expect(res.status(), await res.text()).toBe(200);
    // The changed field, and the version the form started from.
    expect(res.request().postDataJSON()).toEqual({ purchasePrice: 25, expectedUpdatedAt: created.updatedAt });
    await expect(dialog).toBeHidden();

    const item = await getBottle(api, created.id);
    expect(Number(item.purchasePrice)).toBe(25);
    // Only the price counts as set by hand: the other fields keep their
    // origin (scan/import badges are cleared field by field the same way).
    expect(item.lockedFields).toEqual(['purchasePrice']);
    expect(item.name).toBe(name);
    expect(item.vintage).toBe(2015);
  } finally {
    await api.delete(`/api/inventory/${created.id}`).catch(() => {});
  }
});

test('saving a form opened before someone else changed the bottle does not overwrite it (#572)', async ({ page }) => {
  const api = page.request;
  const name = `E2E #572 conflict ${Date.now()}`;
  const { id } = await createBottle(api, name);

  try {
    const dialog = await openEditForm(page, name);
    await dialog.getByRole('button', { name: 'Afficher les compléments' }).click();
    const price = dialog.getByLabel("Prix d'achat (€)");
    await price.fill('');
    await price.pressSequentially('25');

    // Meanwhile, another member marks the bottle opened, half full.
    const other = await api.patch(`/api/inventory/${id}`, { data: { isOpened: true, fillLevel: 50 } });
    expect(other.status(), await other.text()).toBe(200);

    const saved = patchOf(page, id);
    await dialog.getByTestId('inventory-form-submit').click();
    const res = await saved;
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe('CONFLICT');

    await expect(page.getByText('Non enregistré : cet actif a été modifié entre-temps', { exact: false })).toBeVisible();
    // The form stays open with what was typed.
    await expect(dialog.getByLabel("Prix d'achat (€)")).toHaveValue('25');

    const item = await getBottle(api, id);
    expect(item.isOpened).toBe(true);
    expect(item.fillLevel).toBe(50);
    expect(Number(item.purchasePrice)).toBe(20);
  } finally {
    await api.delete(`/api/inventory/${id}`).catch(() => {});
  }
});

test('a fill level set in the detail window is kept when the bottle is then edited (#572)', async ({ page }) => {
  const api = page.request;
  const name = `E2E #572 detail ${Date.now()}`;
  const { id } = await createBottle(api, name);

  try {
    // Half full from the detail window: a save the edit form opened next
    // must start from, not conflict with.
    const detail = await openDetail(page, name);
    const filled = patchOf(page, id);
    await detail.getByRole('button', { name: 'Moitié', exact: true }).click();
    expect((await filled).status()).toBe(200);

    const dialog = await openEditForm(page, name, detail);
    await dialog.getByRole('button', { name: 'Afficher les compléments' }).click();
    const price = dialog.getByLabel("Prix d'achat (€)");
    await price.fill('');
    await price.pressSequentially('25');

    const saved = patchOf(page, id);
    await dialog.getByTestId('inventory-form-submit').click();
    const res = await saved;
    expect(res.status(), await res.text()).toBe(200);
    expect(Object.keys(res.request().postDataJSON() as object).sort()).toEqual(['expectedUpdatedAt', 'purchasePrice']);
    await expect(dialog).toBeHidden();

    const item = await getBottle(api, id);
    expect(item.isOpened).toBe(true);
    expect(item.fillLevel).toBe(50);
    expect(Number(item.purchasePrice)).toBe(25);
  } finally {
    await api.delete(`/api/inventory/${id}`).catch(() => {});
  }
});
