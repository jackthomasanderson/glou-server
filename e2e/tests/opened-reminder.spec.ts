import { test, expect, type APIRequestContext, type APIResponse, type Locator, type Page } from '@playwright/test';

/**
 * #471 (lot L2, ux-ui.md §10.4.2-10.4.3, §10.4.6): the reminder of the
 * opened bottle (FEAT-105) — "Finir l'entamée" / "En ouvrir une nouvelle",
 * "C'est elle que vous avez finie ?", "Dans la boîte entamée ?" — the plan
 * finishing it first, and "Annuler l'ouverture" keeping a tasting noted on
 * the bottle (FEAT-106 c2).
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;
const year = new Date().getFullYear();

type Unit = {
  id: string; productId: string; quantity: number | null; isOpened: boolean; fillLevel: number | null;
  cigarsLeft: number | null; parentItemId: string | null; deletedAt: string | null; updatedAt: string;
};
type Write = { data: Unit; changed: Unit[]; removedIds: string[] };

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

async function okWrite(res: APIResponse): Promise<Write> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()) as Write;
}

const productOf = async (api: APIRequestContext, productId: string) =>
  okData<{ items: Unit[]; tastings: { id: string; itemId: string | null }[] }>(await api.get(`/api/products/${productId}`));
const unitsOf = async (api: APIRequestContext, productId: string) =>
  (await productOf(api, productId)).items.filter((unit) => unit.deletedAt == null);

/** A wine of `quantity` bottles with one of them opened at `level` %, the way the drawer does it. */
async function wineWithOpened(api: APIRequestContext, name: string, quantity: number, level: number, extra: object = {}) {
  const group = await okData<Unit>(await api.post('/api/inventory', {
    data: { category: 'wine', name, producer: 'E2E Domaine', purchasePrice: 20, quantity, ...extra },
  }));
  const opened = await okWrite(await api.patch(`/api/inventory/${group.id}`, { data: { isOpened: true, fillLevel: 100 } }));
  // The level on that one bottle, never on the group.
  const sub = await okWrite(await api.patch(`/api/inventory/${opened.data.id}`, { data: { fillLevel: level } }));
  return { group, sub: sub.data };
}

/** The drawer of a wine, opened from its link. */
async function openDrawer(page: Page, productId: string, name: string): Promise<Locator> {
  await page.goto(`/bottles?scan=${encodeURIComponent(productId)}`);
  const drawer = page.getByRole('dialog').filter({ has: page.locator('#inventory-detail-title') });
  await expect(drawer.locator('#inventory-detail-title')).toHaveText(name);
  await page.waitForLoadState('networkidle');
  return drawer;
}

const reminder = (page: Page) => page.getByTestId('opened-reminder-dialog');

test.describe('the opened bottle first (#471, L2)', () => {
  const families: string[] = [];
  test.afterEach(async ({ page }) => {
    for (const productId of families.splice(0)) await page.request.delete(`/api/products/${productId}`).catch(() => {});
  });

  test('"J\'en ouvre une" reminds of the opened bottle at 60 %: "Finir l\'entamée" opens nothing, "En ouvrir une nouvelle" opens one (FEAT-105 c1-c2)', async ({ page }) => {
    const api = page.request;
    const name = `E2E L2 open ${stamp()}`;
    const { group, sub } = await wineWithOpened(api, name, 6, 60);
    families.push(group.productId);
    const drawer = await openDrawer(page, group.productId, name);

    let patches = 0;
    page.on('request', (request) => { if (request.method() === 'PATCH') patches += 1; });
    await drawer.getByTestId('stock-move-open').click();
    await expect(reminder(page)).toContainText('Une bouteille est déjà entamée (60 %).');
    await reminder(page).getByRole('button', { name: "Finir l'entamée" }).click();
    await expect(reminder(page)).toBeHidden();
    // Led to the opened bottle, nothing written.
    await expect(drawer.locator(`[data-line-id="${sub.id}"]`)).toBeFocused();
    expect(patches).toBe(0);
    expect((await unitsOf(api, group.productId)).find((unit) => unit.id === group.id)?.quantity).toBe(5);

    await drawer.getByTestId('stock-move-open').click();
    const sent = page.waitForResponse((r) => r.url().endsWith(`/api/inventory/${group.id}`) && r.request().method() === 'PATCH');
    await reminder(page).getByRole('button', { name: 'En ouvrir une nouvelle' }).click();
    expect((await sent).status()).toBe(200);
    await expect(drawer.getByTestId('family-drawer-stock')).toContainText('4 pleines · 2 entamées');
    const units = await unitsOf(api, group.productId);
    expect(units.filter((unit) => unit.isOpened)).toHaveLength(2);
  });

  test('"J\'en bois une": "C\'est elle que vous avez finie ?" — "Oui" finishes the opened one, the group stays ×5 (FEAT-105 c5)', async ({ page }) => {
    const api = page.request;
    const name = `E2E L2 drink ${stamp()}`;
    const { group, sub } = await wineWithOpened(api, name, 6, 60);
    families.push(group.productId);
    const drawer = await openDrawer(page, group.productId, name);

    await drawer.getByTestId('stock-move-drink').click();
    await expect(reminder(page)).toContainText("C'est elle que vous avez finie ?");
    const sent = page.waitForResponse((r) => r.url().endsWith(`/api/inventory/${sub.id}`) && r.request().method() === 'PATCH');
    await reminder(page).getByRole('button', { name: 'Oui' }).click();
    expect((await sent).status()).toBe(200);

    const units = await unitsOf(api, group.productId);
    expect(units.find((unit) => unit.id === sub.id)).toMatchObject({ isOpened: true, fillLevel: 0 });
    expect(units.find((unit) => unit.id === group.id)?.quantity).toBe(5);
    await expect(drawer.getByTestId('family-drawer-stock')).toContainText('5 bouteilles');
  });

  test('"Annuler l\'ouverture" on a bottle with a tasting: asked, kept, the bottle back with the others ×6 (FEAT-106 c1-c2)', async ({ page }) => {
    const api = page.request;
    const name = `E2E L2 put back ${stamp()}`;
    const { group, sub } = await wineWithOpened(api, name, 6, 60);
    families.push(group.productId);
    await okData(await api.post('/api/tastings', { data: { itemId: sub.id, rating: 4 } }));
    const drawer = await openDrawer(page, group.productId, name);

    await drawer.locator(`[data-line-id="${sub.id}"]`).getByTestId('stock-line-menu').click();
    const asked = page.waitForResponse((r) => r.url().endsWith(`/api/inventory/${sub.id}`) && r.request().method() === 'PATCH');
    // The menu sits in a portal hidden from the accessibility tree (#727): found by its text.
    await page.locator('[role="menuitem"]').filter({ hasText: "Annuler l'ouverture" }).click();
    expect((await asked).status()).toBe(409);
    const keep = page.getByTestId('keep-tasting-dialog');
    await expect(keep).toContainText('Une dégustation a été notée sur cette bouteille.');

    const sent = page.waitForResponse((r) => r.url().endsWith(`/api/inventory/${sub.id}`) && r.request().method() === 'PATCH');
    await keep.getByRole('button', { name: 'Garder la dégustation' }).click();
    expect((await sent).status()).toBe(200);
    await expect(page.getByText(/Bouteille remise avec les autres/)).toBeVisible();
    await expect(drawer.getByTestId('family-drawer-stock')).toContainText('6 bouteilles');

    const product = await productOf(api, group.productId);
    expect(product.items.filter((unit) => unit.deletedAt == null).map((unit) => [unit.id, unit.quantity, unit.isOpened]))
      .toEqual([[group.id, 6, false]]);
    // Kept: still on the wine, on the line the bottle went back to (recette #471, KO 8.4).
    expect(product.tastings).toEqual([expect.objectContaining({ itemId: group.id })]);
    const tastings = drawer.getByTestId('family-tastings');
    await expect(tastings).toBeVisible();
    await expect(tastings).not.toContainText('Goûté ailleurs');
  });

  test('a cigar with an opened box of 10 and two closed boxes: "Dans la boîte entamée" leaves 9, the closed boxes alone (FEAT-105 c4)', async ({ page }) => {
    const api = page.request;
    const name = `E2E L2 cigar ${stamp()}`;
    const boxes = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'cigar', name, producer: 'E2E Manufacture', format: 'Robusto', quantity: 3, cigarsPerBox: 25 },
    }));
    families.push(boxes.productId);
    const opened = await okWrite(await api.patch(`/api/inventory/${boxes.id}`, { data: { smokeOne: true } }));
    const box = await okWrite(await api.patch(`/api/inventory/${opened.data.id}`, { data: { cigarsLeft: 10 } }));
    const drawer = await openDrawer(page, boxes.productId, name);

    await drawer.getByTestId('stock-move-smoke').click();
    await expect(reminder(page)).toContainText('Dans la boîte entamée (10 restants) ou en ouvrir une nouvelle ?');
    const sent = page.waitForResponse((r) => r.url().endsWith(`/api/inventory/${box.data.id}`) && r.request().method() === 'PATCH');
    await reminder(page).getByRole('button', { name: 'Dans la boîte entamée' }).click();
    expect((await sent).status()).toBe(200);

    const units = await unitsOf(api, boxes.productId);
    expect(units.find((unit) => unit.id === box.data.id)?.cigarsLeft).toBe(9);
    expect(units.find((unit) => unit.id === boxes.id)?.quantity).toBe(2);
  });

  test('the consumption plan suggests a wine at its peak through its opened bottle (FEAT-105 c3)', async ({ page }) => {
    const api = page.request;
    const name = `E2E L2 plan ${stamp()}`;
    const { group, sub } = await wineWithOpened(api, name, 6, 60, { peakMaturityFrom: year - 1, peakMaturityTo: year + 1 });
    families.push(group.productId);

    const suggestions = await okData<{ id: string; productId: string; isOpened: boolean; fillLevel: number | null }[]>(
      await api.get('/api/consumption-plan/suggestions?limit=50'),
    );
    const mine = suggestions.filter((suggestion) => suggestion.productId === group.productId);
    expect(mine).toEqual([expect.objectContaining({ id: sub.id, isOpened: true, fillLevel: 60 })]);
  });
});
