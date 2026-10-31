import { test, expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';

/**
 * #471 (FEAT-95, ux-ui.md §10.3 / §10.4.1): cigars in closed boxes and
 * single cigars. A cigar is one card counted in cigars; it is stored as
 * "N boîtes fermées de M" or "N cigares à l'unité", at the price of ONE box
 * or cigar. Shared inventory: every family created here is put in the trash.
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

type Unit = {
  id: string; productId: string; quantity: number; cigarsPerBox: number | null; cigarsLeft: number | null;
  isOpened: boolean; fillLevel: number | null; purchasePrice: number | null; writtenOffAt: string | null; parentItemId: string | null;
};
type Written = { data: Unit; changed: Unit[]; removedIds: string[] };

async function okBody<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()) as T;
}
const okData = async <T>(res: APIResponse) => (await okBody<{ data: T }>(res)).data;

const items = async (api: APIRequestContext, productId: string) =>
  (await okData<{ items: Unit[] }>(await api.get(`/api/products/${productId}`))).items.filter((unit) => !unit.writtenOffAt);
const write = async (api: APIRequestContext, id: string, data: Record<string, unknown>) =>
  okBody<Written>(await api.patch(`/api/inventory/${id}`, { data }));

/** The drawer of a cigar, opened from its link (the QR code path). */
async function openDrawer(page: Page, productId: string) {
  await page.goto(`/cigars?scan=${encodeURIComponent(productId)}`);
  const drawer = page.getByRole('dialog').filter({ has: page.locator('#inventory-detail-title') });
  await expect(drawer.getByTestId('family-drawer-stock')).toBeVisible();
  return drawer;
}

const closeDrawer = async (drawer: ReturnType<Page['getByRole']>) => {
  await drawer.getByRole('button', { name: 'Fermer' }).first().click();
  await expect(drawer).toBeHidden();
};

test.describe('FEAT-95 — cigars in closed boxes and single cigars', () => {
  const families: string[] = [];

  test.afterEach(async ({ page }) => {
    for (const id of families.splice(0)) await page.request.delete(`/api/products/${id}`).catch(() => {});
  });

  test('c1-c3: 3 boxes of 25 at 200 €, then 4 single cigars at 9 €: one card, 89 cigars with an opened box', async ({ page }) => {
    const api = page.request;
    const name = `E2E Robusto ${stamp()}`;

    // c1: through the add form — closed boxes, their size, the price of one box.
    await page.goto('/cigars');
    await page.getByTestId('inventory-add-button').click();
    const form = page.getByRole('dialog');
    await form.getByTestId('inventory-name-input').fill(name);
    await form.getByTestId('inventory-producer-input').fill('E2E Habanos');
    await expect(form.getByRole('radio', { name: 'Boîtes fermées' })).toBeChecked();
    await form.getByTestId('cigar-quantity-input').fill('3');
    await form.getByTestId('cigars-per-box-input').fill('25');
    await expect(form.getByText('soit 75 cigares')).toBeVisible();
    await form.getByTestId('inventory-unit-price-input').pressSequentially('200');
    const created = page.waitForResponse((r) => /\/api\/inventory\/?$/.test(r.url()) && r.request().method() === 'POST');
    await form.getByTestId('inventory-form-submit').click();
    const res = await created;
    expect(res.status(), await res.text()).toBe(201);
    expect(res.request().postDataJSON()).toMatchObject({ category: 'cigar', quantity: 3, cigarsPerBox: 25, purchasePrice: 200 });
    const boxes = (await res.json()).data as Unit;
    families.push(boxes.productId);
    await expect(form).toBeHidden();

    const card = page.getByTestId('family-card').filter({ hasText: name });
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId('family-card-badge')).toHaveText('75');
    let drawer = await openDrawer(page, boxes.productId);
    await expect(drawer.getByTestId('family-drawer-stock')).toContainText('75 cigares');
    await expect(drawer.getByTestId('family-drawer-stock')).toContainText(/valeur estimée 600/);

    // c2: "Ajouter des cigares" — single cigars at the price of one cigar: a second line, the same card.
    await drawer.getByTestId('add-units-button').click();
    const add = page.getByRole('dialog').filter({ has: page.getByTestId('add-units-submit') });
    await add.getByRole('radio', { name: "À l'unité" }).check();
    await add.getByTestId('cigar-quantity-input').fill('4');
    await add.getByTestId('add-units-price').fill('');
    await add.getByTestId('add-units-price').pressSequentially('9');
    const added = page.waitForResponse((r) => r.url().endsWith(`/api/products/${boxes.productId}/items`) && r.request().method() === 'POST');
    await add.getByTestId('add-units-submit').click();
    const addRes = await added;
    expect(addRes.status(), await addRes.text()).toBe(201);
    expect(addRes.request().postDataJSON()).toMatchObject({ quantity: 4, cigarsPerBox: null, purchasePrice: 9 });
    await expect(add).toBeHidden();
    await expect(page.getByText(`4 cigares ajoutés à ${name}`)).toBeVisible();
    await expect(drawer.getByTestId('family-drawer-stock')).toContainText('79 cigares');
    await expect(drawer.getByTestId('family-drawer-stock')).toContainText(/valeur estimée 636/);
    await expect(drawer.getByTestId('family-line')).toHaveCount(2);
    await closeDrawer(drawer);
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId('family-card-badge')).toHaveText('79');

    // c3: a 4th box, then one cigar smoked: the first cigar of a closed box opens it (24 left) …
    await okBody(await api.post(`/api/products/${boxes.productId}/items`, { data: { quantity: 1, cigarsPerBox: 25, purchasePrice: 200 } }));
    const smoked = await write(api, boxes.id, { smokeOne: true });
    expect(smoked.data).toMatchObject({ isOpened: true, cigarsLeft: 24, cigarsPerBox: 25, quantity: 1, parentItemId: boxes.id });
    expect(smoked.changed).toEqual([expect.objectContaining({ id: boxes.id, quantity: 3 })]);
    // … then 14 more smoked from it: 10 left.
    await write(api, smoked.data.id, { cigarsLeft: 10 });

    drawer = await openDrawer(page, boxes.productId);
    await expect(drawer.getByTestId('family-drawer-stock')).toContainText("89 cigares · 3 boîtes fermées · 1 entamée · 4 à l'unité");
    await expect(drawer.getByTestId('family-line').filter({ hasText: 'Boîte entamée' })).toContainText('10 restants');
    await expect(drawer.getByTestId('family-line').filter({ hasText: '3 boîtes fermées de 25' })).toHaveCount(1);
    await expect(drawer.getByTestId('family-line').filter({ hasText: "4 cigares à l'unité" })).toHaveCount(1);
    await closeDrawer(drawer);
    await expect(card.getByTestId('family-card-badge')).toHaveText('89');
    // The card draws its separators apart: "3 boîtes fermées · 1 entamée · 4 à l'unité".
    await expect(card.getByTestId('family-stock-line')).toContainText(/3\sboîtes fermées\s*·\s*1\sentamée\s*·\s*4\sà l'unité/);
  });

  test('a single cigar smoked is finished, kept as smoked; correcting 3 boxes to 2 takes 25 cigars off, none smoked (c4)', async ({ page }) => {
    const api = page.request;
    const boxes = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'cigar', name: `E2E Corona ${stamp()}`, producer: 'E2E Habanos', quantity: 3, cigarsPerBox: 25, purchasePrice: 200 },
    }));
    families.push(boxes.productId);
    const singles = await okBody<Written>(await api.post(`/api/products/${boxes.productId}/items`, { data: { quantity: 4, purchasePrice: 9 } }));

    // One of 4 single cigars smoked: a finished sub-record, 3 left.
    const smoked = await write(api, singles.data.id, { smokeOne: true });
    expect(smoked.data).toMatchObject({ isOpened: true, fillLevel: 0, quantity: 1, parentItemId: singles.data.id });
    expect(smoked.changed).toEqual([expect.objectContaining({ id: singles.data.id, quantity: 3 })]);

    // c4: an input error on the boxes: 25 cigars fewer, nothing smoked.
    const corrected = await api.post(`/api/inventory/${boxes.id}/correct`, { data: { quantity: 2, reason: 'input_error' } });
    expect(corrected.ok(), await corrected.text()).toBe(true);
    const units = await items(api, boxes.productId);
    expect(units.filter((unit) => unit.isOpened).map((unit) => unit.id)).toEqual([smoked.data.id]);

    const drawer = await openDrawer(page, boxes.productId);
    await expect(drawer.getByTestId('family-drawer-stock')).toContainText("53 cigares · 2 boîtes fermées · 3 à l'unité");
    // The smoked one stays in "Déjà fumés ou partis".
    await expect(drawer.getByText('1 fumé')).toBeVisible();
  });

  test('a cigar box is stored opened with the cigars left in it, never closed again once smoked from', async ({ page }) => {
    const api = page.request;
    const box = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'cigar', name: `E2E Opened ${stamp()}`, producer: 'E2E Habanos', quantity: 1, cigarsPerBox: 25, isOpened: true, cigarsLeft: 10 },
    }));
    families.push(box.productId);
    expect(box).toMatchObject({ quantity: 1, cigarsPerBox: 25, isOpened: true, cigarsLeft: 10 });

    // Several opened boxes, or an empty group, are refused at creation.
    for (const data of [
      { quantity: 2, cigarsPerBox: 25, isOpened: true, cigarsLeft: 10 },
      { quantity: 0 },
      { quantity: 1, cigarsPerBox: 25, isOpened: true, cigarsLeft: 26 },
    ]) {
      const refused = await api.post('/api/inventory', { data: { category: 'cigar', name: `E2E Refused ${stamp()}`, producer: 'E2E Habanos', ...data } });
      expect(refused.status(), JSON.stringify(data)).toBe(400);
    }

    // Closing a box smoked from would bring cigars back: refused, with its own reason.
    const closed = await api.patch(`/api/inventory/${box.id}`, { data: { isOpened: false } });
    expect(closed.status()).toBe(400);
    expect((await closed.json()).error).toBe('BOX_NOT_COMPLETE');
  });
});
