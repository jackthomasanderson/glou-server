import { test, expect, type APIRequestContext, type APIResponse, type Locator, type Page } from '@playwright/test';

/**
 * #642: editing a tasting showed its perceived maturity and expert grid
 * empty, and saving it untouched erased its perceived maturity.
 * #595: "Asset opened" after a tasting put an opened bottle back to 50 %,
 * opened today.
 * #586: "Asset consumed" after a cigar tasting emptied the whole box.
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

type Row = { id: string };

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

async function createItem(api: APIRequestContext, data: Record<string, unknown>): Promise<string> {
  return (await okData<Row>(await api.post('/api/inventory', { data }))).id;
}

/** Opens the item's sheet from the global search, then its tasting form. */
async function openTastingFormOf(page: Page, name: string) {
  await page.goto('/cellars');
  const search = page.getByRole('combobox').filter({ visible: true }).first();
  await search.fill(name);
  await expect(page.getByRole('option', { name: new RegExp(name) }).first()).toBeVisible();
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(page.locator('#inventory-detail-title')).toHaveText(name);
  const detail = page.getByRole('dialog').filter({ has: page.locator('#inventory-detail-title') });
  await detail.getByRole('button', { name: 'Dégustation', exact: true }).click();
  const form = page.getByRole('dialog').filter({ hasText: 'Nouvelle dégustation' });
  await expect(form).toBeVisible();
  return form;
}

/** Saves the new tasting and returns the stock question window. */
async function saveAndAskStock(page: Page, form: Locator, tastingIds: string[]) {
  const created = page.waitForResponse(
    (r) => /\/api\/tastings\/?$/.test(r.url()) && r.request().method() === 'POST',
  );
  await form.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  const res = await created;
  expect(res.status(), await res.text()).toBe(201);
  tastingIds.push(((await res.json()).data as Row).id);
  const stock = page.getByRole('dialog').filter({ hasText: 'Mettre à jour le stock ?' });
  await expect(stock).toBeVisible();
  return stock;
}

test('editing a tasting keeps its perceived maturity and expert grid', async ({ page }) => {
  const api = page.request;
  const name = `E2E #642 ${stamp()}`;
  const { expertMode } = await okData<{ expertMode: boolean }>(await api.get('/api/user/me'));
  let itemId = '';
  let tastingId = '';
  try {
    await okData(await api.patch('/api/user/preferences', { data: { expertMode: true } }));
    itemId = await createItem(api, { category: 'wine', name, producer: 'E2E Domaine' });
    tastingId = (
      await okData<Row>(
        await api.post('/api/tastings', {
          data: {
            itemId, rating: 4, readiness: 'PERFECT', notes: 'Soyeux',
            robe: 'Rubis profond', nez: 'Cassis, cèdre', bouche: 'Ferme et fraîche',
            tanin: 4, acidite: 3, longueurBouche: 12,
          },
        }),
      )
    ).id;

    await page.goto('/cellar-journal');
    await page.getByPlaceholder('Rechercher par met ou par bouteille...').fill(name);
    // Once the search has applied, this tasting's card is the only one left.
    await expect(page.getByText(`${name} — E2E Domaine`)).toBeVisible();
    const edit = page.getByRole('button', { name: 'Modifier', exact: true });
    await expect(edit).toHaveCount(1);
    await edit.click();

    const dialog = page.getByRole('dialog').filter({ hasText: 'Modifier la dégustation' });
    await expect(dialog.getByLabel('Robe', { exact: true })).toHaveValue('Rubis profond');
    await expect(dialog.getByLabel('Nez', { exact: true })).toHaveValue('Cassis, cèdre');
    await expect(dialog.getByLabel('Bouche', { exact: true })).toHaveValue('Ferme et fraîche');
    await expect(dialog.getByLabel('Tanin (1-5)')).toHaveValue('4');
    await expect(dialog.getByLabel('Acidité (1-5)')).toHaveValue('3');
    await expect(dialog.getByLabel('Longueur en bouche')).toHaveValue('12');
    await expect(dialog.locator('[data-slot="value"]', { hasText: 'À point' })).toBeVisible();

    // Saved untouched: everything stays.
    const saved = page.waitForResponse(
      (r) => r.url().endsWith(`/api/tastings/${tastingId}`) && r.request().method() === 'PATCH',
    );
    await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    const res = await saved;
    expect(res.status(), await res.text()).toBe(200);
    await expect(dialog).toBeHidden();

    const notes = await okData<{ notes: Array<Record<string, unknown>> }>(
      await api.get(`/api/tastings?itemId=${itemId}`),
    );
    expect(notes.notes).toHaveLength(1);
    expect(notes.notes[0]).toMatchObject({
      rating: 4, readiness: 'PERFECT', notes: 'Soyeux',
      robe: 'Rubis profond', nez: 'Cassis, cèdre', bouche: 'Ferme et fraîche',
      tanin: 4, acidite: 3, longueurBouche: 12,
    });
  } finally {
    if (tastingId) await api.delete(`/api/tastings/${tastingId}`).catch(() => {});
    if (itemId) await api.delete(`/api/inventory/${itemId}`).catch(() => {});
    await api.patch('/api/user/preferences', { data: { expertMode } }).catch(() => {});
  }
});

test('a cigar tasting removes one cigar from its box', async ({ page }) => {
  const api = page.request;
  const name = `E2E #586 ${stamp()}`;
  let itemId = '';
  const tastingIds: string[] = [];
  try {
    itemId = await createItem(api, { category: 'cigar', name, producer: 'E2E Habanos', quantity: 25 });

    const form = await openTastingFormOf(page, name);
    const stock = await saveAndAskStock(page, form, tastingIds);
    await expect(stock.getByRole('button', { name: 'Actif consommé (vide)' })).toHaveCount(0);
    await expect(stock.getByRole('button', { name: 'Actif entamé' })).toHaveCount(0);

    const patched = page.waitForResponse(
      (r) => r.url().endsWith(`/api/inventory/${itemId}`) && r.request().method() === 'PATCH',
    );
    await stock.getByRole('button', { name: 'Retirer un cigare de la boîte (24 restants)' }).click();
    expect((await patched).status()).toBe(200);
    await expect(stock).toBeHidden();

    const box = await okData<{ quantity: number; isOpened: boolean; fillLevel: number | null }>(
      await api.get(`/api/inventory/${itemId}`),
    );
    expect(box.quantity).toBe(24);
    expect(box.isOpened).toBe(false);
  } finally {
    for (const id of tastingIds) await api.delete(`/api/tastings/${id}`).catch(() => {});
    if (itemId) await api.delete(`/api/inventory/${itemId}`).catch(() => {});
  }
});

test('a tasting never reopens an already opened bottle', async ({ page }) => {
  const api = page.request;
  const name = `E2E #595 ${stamp()}`;
  let itemId = '';
  const tastingIds: string[] = [];
  try {
    itemId = await createItem(api, {
      category: 'wine', name, producer: 'E2E Domaine',
      isOpened: true, fillLevel: 25, openedAt: '2026-01-10',
    });

    const form = await openTastingFormOf(page, name);
    const stock = await saveAndAskStock(page, form, tastingIds);
    await expect(stock.getByRole('button', { name: 'Actif consommé (vide)' })).toBeVisible();
    await expect(stock.getByRole('button', { name: 'Actif entamé' })).toHaveCount(0);
    await stock.getByRole('button', { name: 'Ne pas modifier le stock' }).click();
    await expect(stock).toBeHidden();

    const bottle = await okData<{ isOpened: boolean; fillLevel: number | null; openedAt: string | null }>(
      await api.get(`/api/inventory/${itemId}`),
    );
    expect(bottle.isOpened).toBe(true);
    expect(bottle.fillLevel).toBe(25);
    expect(bottle.openedAt?.slice(0, 10)).toBe('2026-01-10');
  } finally {
    for (const id of tastingIds) await api.delete(`/api/tastings/${id}`).catch(() => {});
    if (itemId) await api.delete(`/api/inventory/${itemId}`).catch(() => {});
  }
});
