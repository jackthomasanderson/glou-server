import { test, expect, type APIRequestContext, type APIResponse, type Locator, type Page } from '@playwright/test';

/**
 * #471 (lot L1, ux-ui.md §10.4.2): "J'en ouvre une" / "J'en bois une" from
 * the drawer of a wine — one line: at once, no question (FEAT-104 c1,
 * FEAT-103 c1), with "Annuler" in its message; several lines: "Quelles
 * bouteilles ?", the line bought first preselected, the other one left
 * alone (FEAT-104 c2-c4, FEAT-103 c2).
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

type Unit = {
  id: string; productId: string; cellarId: string | null; quantity: number | null; purchasePrice: number | null;
  isOpened: boolean; fillLevel: number | null; parentItemId: string | null; writtenOffAt: string | null; deletedAt: string | null;
  /** FEAT-93: the cells of the plan its copies occupy. */
  slots: Array<{ id: string; column: number; row: number }>;
};

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

/** The wine's history entries other than its creation: an action taken back at once leaves none (recette #471). */
const changesTold = async (api: APIRequestContext, productId: string) =>
  (await okData<{ history: { action: string }[] }>(await api.get(`/api/products/${productId}`))).history
    .filter((entry) => entry.action !== 'CREATE').map((entry) => entry.action);

const unitsOf = async (api: APIRequestContext, productId: string) =>
  (await okData<{ items: Unit[] }>(await api.get(`/api/products/${productId}`))).items.filter((unit) => unit.deletedAt == null);

/**
 * The message of a gesture ("1 bouteille ouverte · Annuler"), not the drawer's
 * history, which says the same words since recette #847.
 */
const message = (page: Page, text: string) =>
  page.getByText(text).and(page.locator(':not([data-testid="family-history"] *)'));

/** The drawer of a wine, opened from its link. */
async function openDrawer(page: Page, productId: string, name: string): Promise<Locator> {
  await page.goto(`/bottles?scan=${encodeURIComponent(productId)}`);
  const drawer = page.getByRole('dialog').filter({ has: page.locator('#inventory-detail-title') });
  await expect(drawer.locator('#inventory-detail-title')).toHaveText(name);
  await page.waitForLoadState('networkidle');
  return drawer;
}

test.describe('open or drink one bottle of a wine (#471, L1)', () => {
  const families: string[] = [];
  const cellars: string[] = [];
  test.afterEach(async ({ page }) => {
    const api = page.request;
    for (const productId of families.splice(0)) await api.delete(`/api/products/${productId}`).catch(() => {});
    for (const cellarId of cellars.splice(0)) await api.delete(`/api/cellars/${cellarId}`).catch(() => {});
  });

  test('one line ×6: "J\'en ouvre une" opens one at once, "Annuler" puts it back', async ({ page }) => {
    const api = page.request;
    const name = `E2E L1 open ${stamp()}`;
    const group = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'wine', name, producer: 'E2E Domaine', purchasePrice: 20, quantity: 6 },
    }));
    families.push(group.productId);
    expect(group.quantity).toBe(6);

    const drawer = await openDrawer(page, group.productId, name);
    const sent = page.waitForResponse((r) => r.url().endsWith(`/api/inventory/${group.id}`) && r.request().method() === 'PATCH');
    await drawer.getByTestId('stock-move-open').click();
    expect((await sent).status()).toBe(200);
    // No question for a single line.
    await expect(page.getByText('Quelles bouteilles ?')).toHaveCount(0);

    // FEAT-103 c1: ×5 and an opened bottle, 6 in all.
    await expect(drawer.getByTestId('family-drawer-stock')).toContainText('5 pleines · 1 entamée');
    const units = await unitsOf(api, group.productId);
    expect(units.find((unit) => unit.id === group.id)?.quantity).toBe(5);
    expect(units.filter((unit) => unit.isOpened && unit.parentItemId === group.id)).toHaveLength(1);

    // "1 bouteille ouverte · Annuler": back to ×6.
    await expect(message(page, '1 bouteille ouverte')).toBeVisible();
    const undone = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/api/inventory/'));
    await page.locator('button', { hasText: /^Annuler$/ }).last().click();
    expect((await undone).status()).toBe(200);
    await expect(drawer.getByTestId('family-drawer-stock')).toContainText('6 bouteilles');
    await expect(drawer.getByTestId('family-line')).toHaveCount(1);
    expect((await unitsOf(api, group.productId)).map((unit) => [unit.id, unit.quantity, unit.isOpened])).toEqual([[group.id, 6, false]]);
    // Opened then put back at once: not one of the four entries it wrote is told (recette #471).
    await expect.poll(() => changesTold(api, group.productId)).toEqual([]);
  });

  test('garage ×4 and kitchen ×2: "J\'en bois une" asks which, the one bought first preselected', async ({ page }) => {
    const api = page.request;
    const garage = (await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E L1 Garage ${stamp()}` } }))).id;
    const kitchen = (await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E L1 Cuisine ${stamp()}` } }))).id;
    cellars.push(garage, kitchen);
    const name = `E2E L1 drink ${stamp()}`;
    const garageLine = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'wine', name, producer: 'E2E Domaine', purchasePrice: 20, quantity: 4, cellarId: garage },
    }));
    families.push(garageLine.productId);
    const kitchenLine = await okData<Unit>(await api.post(`/api/products/${garageLine.productId}/items`, {
      data: { quantity: 2, purchasePrice: 20, cellarId: kitchen, purchasedAt: '2020-01-15' },
    }));
    expect(kitchenLine.id).not.toBe(garageLine.id);

    const drawer = await openDrawer(page, garageLine.productId, name);
    await drawer.getByTestId('stock-move-drink').click();

    const dialog = page.getByRole('dialog').filter({ has: page.locator('header', { hasText: 'Quelles bouteilles ?' }) });
    await expect(dialog.getByRole('radio')).toHaveCount(2);
    await expect(dialog.getByRole('radio', { checked: true })).toHaveAttribute('value', kitchenLine.id);
    await expect(dialog).toContainText('Achetée en premier');

    const sent = page.waitForResponse((r) => r.url().endsWith(`/api/inventory/${kitchenLine.id}`) && r.request().method() === 'PATCH');
    await dialog.getByRole('button', { name: "J'en bois une" }).click();
    expect((await sent).status()).toBe(200);
    await expect(dialog).toBeHidden();

    // FEAT-104 c4: one bottle of the kitchen line drunk, the garage line untouched.
    const units = await unitsOf(api, garageLine.productId);
    expect(units.find((unit) => unit.id === kitchenLine.id)?.quantity).toBe(1);
    expect(units.find((unit) => unit.id === garageLine.id)?.quantity).toBe(4);
    expect(units.filter((unit) => unit.isOpened && unit.fillLevel === 0)).toHaveLength(1);
    await expect(drawer.getByTestId('family-drawer-stock')).toContainText('5 bouteilles');
  });

  // Review of L1: a bottle alone in its grid slot, drunk, gives the slot back
  // (#573); "Annuler" puts it back in that slot (FEAT-93: `placeAt`).
  test('"Annuler" a bottle alone in its slot puts it back in the slot', async ({ page }) => {
    const api = page.request;
    const cellar = (await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E L1 Plan ${stamp()}`, columns: 3, rows: 3 } }))).id;
    cellars.push(cellar);
    const name = `E2E L1 slot ${stamp()}`;
    const bottle = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'wine', name, producer: 'E2E Domaine', purchasePrice: 20, cellarId: cellar },
    }));
    families.push(bottle.productId);
    expect((await api.post(`/api/inventory/${bottle.id}/slots`, { data: { column: 2, row: 3 } })).status()).toBe(201);

    const drawer = await openDrawer(page, bottle.productId, name);
    const drunk = page.waitForResponse((r) => r.url().endsWith(`/api/inventory/${bottle.id}`) && r.request().method() === 'PATCH');
    await drawer.getByTestId('stock-move-drink').click();
    expect((await drunk).status()).toBe(200);
    expect((await unitsOf(api, bottle.productId))[0]).toMatchObject({ fillLevel: 0, slots: [] });

    await expect(message(page, '1 bouteille bue')).toBeVisible();
    const undone = page.waitForResponse((r) => r.url().endsWith(`/api/inventory/${bottle.id}`) && r.request().method() === 'PATCH');
    await page.locator('button', { hasText: /^Annuler$/ }).last().click();
    expect((await undone).status()).toBe(200);
    expect((await unitsOf(api, bottle.productId))[0]).toMatchObject({
      id: bottle.id, isOpened: false, fillLevel: 100, slots: [expect.objectContaining({ column: 2, row: 3 })],
    });
    // Only its placing in the slot is told, not the drink taken back (recette #471).
    await expect.poll(() => changesTold(api, bottle.productId)).toEqual(['UPDATE']);
  });

  // Recette v3 of #471: the message covered the drawer's close button —
  // pressing the cross closed the message, not the drawer.
  test('the message of a move never covers the close button of the drawer', async ({ page }) => {
    const api = page.request;
    const name = `E2E RE toast ${stamp()}`;
    const group = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'wine', name, producer: 'E2E Domaine', quantity: 2 },
    }));
    families.push(group.productId);

    const drawer = await openDrawer(page, group.productId, name);
    await drawer.getByTestId('stock-move-open').click();
    await expect(message(page, '1 bouteille ouverte')).toBeVisible();

    const close = drawer.getByRole('button', { name: 'Fermer' }).first();
    const box = (await close.boundingBox())!;
    // Once the message has slid into place (it enters from the top edge).
    const onTop = () => page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label') ?? null,
      [box.x + box.width / 2, box.y + box.height / 2] as const);
    await expect.poll(onTop, { timeout: 3000 }).toBe('Fermer');
    await close.click();
    await expect(drawer).toBeHidden();
  });
});
