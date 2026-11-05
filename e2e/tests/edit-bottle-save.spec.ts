import { test, expect, type Page, type Locator, type APIRequestContext } from '@playwright/test';

/**
 * #572: saving the edit form sent the whole record as it was when the form
 * opened. A change made meanwhile by someone else was overwritten without a
 * word, and the API locked every field it received and dropped its scan/import
 * source. The form now sends only the changed fields plus the version it
 * started from, and the API refuses (409) a save made from an old version.
 *
 * #643: the name was greyed out when editing, so a misread name could not be
 * corrected.
 *
 * #471 (FEAT-92 c4): "Modifier" in the drawer of a wine edits its description,
 * once for all its bottles (PATCH /api/products/:id, the wine's own version).
 */

type Bottle = { id: string; productId: string; updatedAt: string };

async function createBottle(api: APIRequestContext, name: string, extra: Record<string, unknown> = {}): Promise<Bottle> {
  const created = await api.post('/api/inventory', {
    data: { category: 'wine', name, producer: 'E2E Domaine', vintage: 2015, region: 'Bourgogne', purchasePrice: 20, ...extra },
  });
  expect(created.status(), await created.text()).toBe(201);
  return (await created.json()).data as Bottle;
}

async function getBottle(api: APIRequestContext, id: string) {
  return (await (await api.get(`/api/inventory/${id}`)).json()).data as Record<string, unknown>;
}

async function getWine(api: APIRequestContext, productId: string) {
  return (await (await api.get(`/api/products/${productId}`)).json()).data as Record<string, unknown> & { updatedAt: string };
}

/**
 * Opens the drawer of the bottle's wine (#471), as a QR code or the global search does.
 * Straight to the page: the whole e2e run shares the API's request budget.
 */
async function openDetail(page: Page, id: string, name: string) {
  await page.goto(`/bottles?scan=${encodeURIComponent(id)}`);
  await expect(page.locator('#inventory-detail-title')).toHaveText(name);
  return page.getByRole('dialog').filter({ has: page.locator('#inventory-detail-title') });
}

/** Opens the wine's description form, from its drawer. */
async function openEditForm(page: Page, detail: Locator, name: string) {
  // The drawer's own button: the cards behind have "Modifier" ones too.
  await detail.getByRole('button', { name: 'Modifier', exact: true }).click();
  // The form window: the drawer may still be closing.
  const dialog = page.getByRole('dialog').filter({ has: page.getByTestId('inventory-form-submit') });
  await expect(dialog.getByTestId('inventory-name-input')).toHaveValue(name);
  return dialog;
}

function patchOf(page: Page, path: string) {
  return page.waitForResponse((r) => r.url().endsWith(path) && r.request().method() === 'PATCH');
}

test('a wine name can be corrected when editing, without suggestions (#643)', async ({ page }) => {
  const api = page.request;
  const name = `E2E #643 ${Date.now()} Vougot`;
  const fixed = name.replace('Vougot', 'Vougeot');
  const { id, productId } = await createBottle(api, name);

  try {
    const dialog = await openEditForm(page, await openDetail(page, id, name), name);
    const nameInput = dialog.getByTestId('inventory-name-input');
    await expect(nameInput).toBeEnabled();

    // A start of its own name: in the creation form, this bottle would be
    // proposed at once (and picking it would overwrite producer, vintage...).
    await nameInput.fill(name.replace(' Vougot', ''));
    await expect(dialog.locator('[role="option"]')).toHaveCount(0);

    await nameInput.fill(fixed);
    const saved = patchOf(page, `/api/products/${productId}`);
    await dialog.getByTestId('inventory-form-submit').click();
    const res = await saved;
    expect(res.status(), await res.text()).toBe(200);
    expect(Object.keys(res.request().postDataJSON() as object).sort()).toEqual(['expectedUpdatedAt', 'name']);
    await expect(dialog).toBeHidden();

    expect((await getWine(api, productId)).name).toBe(fixed);
    expect((await getBottle(api, id)).name).toBe(fixed);
  } finally {
    await api.delete(`/api/products/${productId}`).catch(() => {});
  }
});

test('saving a form opened before someone else changed the wine does not overwrite it (#572)', async ({ page }) => {
  const api = page.request;
  const name = `E2E #572 conflict ${Date.now()}`;
  const { id, productId } = await createBottle(api, name);

  try {
    const dialog = await openEditForm(page, await openDetail(page, id, name), name);
    const region = dialog.getByLabel('Région');
    await region.fill('Médoc');

    // Meanwhile, another member corrects the region of the same wine.
    const before = await getWine(api, productId);
    const other = await api.patch(`/api/products/${productId}`, { data: { region: 'Graves', expectedUpdatedAt: before.updatedAt } });
    expect(other.status(), await other.text()).toBe(200);

    const saved = patchOf(page, `/api/products/${productId}`);
    await dialog.getByTestId('inventory-form-submit').click();
    const res = await saved;
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe('CONFLICT');

    await expect(page.getByText('Non enregistré : ce vin a été modifié entre-temps', { exact: false })).toBeVisible();
    // The form stays open with what was typed.
    await expect(dialog.getByLabel('Région')).toHaveValue('Médoc');
    expect((await getWine(api, productId)).region).toBe('Graves');
  } finally {
    await api.delete(`/api/products/${productId}`).catch(() => {});
  }
});

test('after the level of an opened bottle set in its drawer, editing the wine sends only the description (#572, D22)', async ({ page }) => {
  const api = page.request;
  const name = `E2E #572 level ${Date.now()}`;
  const { id, productId } = await createBottle(api, name, { isOpened: true, fillLevel: 80 });

  try {
    // #471: only an opened bottle has a level in the wine's drawer (one
    // bottle, nothing detached). That change does not move the wine's own
    // version: the description form opened next must not conflict with it.
    const wineVersion = (await getWine(api, productId)).updatedAt;
    const detail = await openDetail(page, id, name);
    const slider = detail.getByRole('slider', { name: 'Niveau de cette bouteille' });
    await expect(slider).toHaveValue('80');
    const filled = patchOf(page, `/api/inventory/${id}`);
    await slider.focus();
    await page.keyboard.press('ArrowLeft');
    const fillRes = await filled;
    expect(fillRes.status()).toBe(200);
    expect(fillRes.request().postDataJSON()).toMatchObject({ fillLevel: 75 });

    const dialog = await openEditForm(page, detail, name);
    await dialog.getByLabel('Région').fill('Médoc');
    const saved = patchOf(page, `/api/products/${productId}`);
    await dialog.getByTestId('inventory-form-submit').click();
    const res = await saved;
    expect(res.status(), await res.text()).toBe(200);
    // The changed field only, and the version the form started from.
    expect(res.request().postDataJSON()).toEqual({ region: 'Médoc', expectedUpdatedAt: wineVersion });
    await expect(dialog).toBeHidden();

    const wine = await getWine(api, productId);
    expect(wine.region).toBe('Médoc');
    // Set by hand: the region; the untouched fields keep their origin.
    expect(wine.lockedFields).toEqual(['region']);
    const item = await getBottle(api, id);
    expect(item.isOpened).toBe(true);
    expect(item.fillLevel).toBe(75);
    expect(item.vintage).toBe(2015);
  } finally {
    await api.delete(`/api/products/${productId}`).catch(() => {});
  }
});
