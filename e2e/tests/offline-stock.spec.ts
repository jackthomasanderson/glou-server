import { test, expect, type APIRequestContext, type APIResponse, type BrowserContext, type Locator, type Page } from '@playwright/test';

/**
 * #471 (FEAT-108, ux-ui.md §10.8): without network, opening a bottle of a
 * group or correcting its number shows at once — the group one fewer and
 * the bottle on its own line, marked "en attente" — and is sent once when
 * the network is back (c1, c2, c5). A group changed meanwhile by someone
 * else goes to the conflict dialog instead of being written blindly (c4).
 * The actions that need the server stay visible, disabled, with the reason.
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

type Unit = {
  id: string; productId: string; quantity: number | null; isOpened: boolean; fillLevel: number | null;
  parentItemId: string | null; writtenOffAt: string | null; deletedAt: string | null; updatedAt: string;
};

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

const unitsOf = async (api: APIRequestContext, productId: string) =>
  (await okData<{ items: Unit[] }>(await api.get(`/api/products/${productId}`))).items.filter((unit) => unit.deletedAt == null);

async function openDrawer(page: Page, productId: string, name: string): Promise<Locator> {
  await page.goto(`/bottles?scan=${encodeURIComponent(productId)}`);
  const drawer = page.getByRole('dialog').filter({ has: page.locator('#inventory-detail-title') });
  await expect(drawer.locator('#inventory-detail-title')).toHaveText(name);
  await page.waitForLoadState('networkidle');
  return drawer;
}

const dialogTitled = (page: Page, title: string) =>
  page.getByRole('dialog').filter({ has: page.locator('header', { hasText: title }) });

/** Cuts the network: the browser fires `offline`, every request fails. */
async function goOffline(context: BrowserContext, page: Page): Promise<void> {
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
}

test.describe('open, drink or correct without network (#471, FEAT-108)', () => {
  const families: string[] = [];
  test.afterEach(async ({ page, context }) => {
    await context.setOffline(false);
    for (const productId of families.splice(0)) await page.request.delete(`/api/products/${productId}`).catch(() => {});
  });

  test('c1-c2: "J\'en ouvre une" on a ×6 offline shows ×5 + one opened bottle waiting, then is sent once', async ({ page, context }) => {
    const api = page.request;
    const name = `E2E N open ${stamp()}`;
    const group = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'wine', name, producer: 'E2E Domaine', purchasePrice: 20, quantity: 6 },
    }));
    families.push(group.productId);
    const drawer = await openDrawer(page, group.productId, name);

    await goOffline(context, page);
    // §10.8: adding bottles needs the server — visible, unavailable, with the reason.
    await expect(drawer.getByTestId('add-units-button')).toHaveAttribute('aria-disabled', 'true');

    await drawer.getByTestId('stock-move-open').click();

    // c1: at once, ×5 and an opened bottle, both marked waiting — never the whole line opened.
    await expect(drawer.getByTestId('family-drawer-stock')).toContainText('5 pleines · 1 entamée');
    await expect(drawer.getByTestId('family-line')).toHaveCount(2);
    await expect(drawer.getByTestId('family-line').first()).toContainText('×5');
    await expect(drawer.getByTestId('line-pending')).toHaveCount(2);
    await expect(page.getByText('1 bouteille ouverte · en attente de connexion')).toBeVisible();

    // c2: back online, sent once, against the group's version.
    const sent: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'PATCH' && request.url().includes('/api/inventory/')) sent.push(request.url());
    });
    const synced = page.waitForResponse((r) => r.url().endsWith(`/api/inventory/${group.id}`) && r.request().method() === 'PATCH');
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    expect((await synced).status()).toBe(200);

    await expect(drawer.getByTestId('line-pending')).toHaveCount(0);
    await expect(drawer.getByTestId('family-drawer-stock')).toContainText('5 pleines · 1 entamée');
    const units = await unitsOf(api, group.productId);
    expect(units.find((unit) => unit.id === group.id)?.quantity).toBe(5);
    expect(units.filter((unit) => unit.isOpened && unit.parentItemId === group.id)).toHaveLength(1);
    // c3: one request only, even with the page's own replay triggers.
    await page.waitForTimeout(1000);
    expect(sent).toEqual([expect.stringContaining(`/api/inventory/${group.id}`)]);
  });

  test('c5: "Corriger le nombre" ×6 → ×5 "cassée, offerte ou perdue" offline, then in the history', async ({ page, context }) => {
    const api = page.request;
    const name = `E2E N correct ${stamp()}`;
    const group = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'wine', name, producer: 'E2E Domaine', purchasePrice: 20, quantity: 6 },
    }));
    families.push(group.productId);
    const drawer = await openDrawer(page, group.productId, name);
    await goOffline(context, page);

    const line = drawer.getByTestId('family-line');
    await line.getByRole('button', { name: 'Actions de cette ligne' }).click();
    // §10.8: moving part of a line waits for the network — shown, disabled, with the reason.
    const move = page.locator('[role="menuitem"]').filter({ hasText: 'Déplacer' });
    await expect(move).toHaveAttribute('aria-disabled', 'true');
    await expect(move).toContainText('Disponible au retour de la connexion');
    await page.locator('[role="menuitem"]').filter({ hasText: 'Corriger le nombre' }).click();
    const dialog = dialogTitled(page, 'Corriger le nombre');
    await dialog.getByLabel('Nombre de bouteilles').fill('5');
    await dialog.getByRole('radio', { name: 'Cassée, offerte ou perdue' }).check();
    await dialog.getByRole('button', { name: 'Corriger', exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(drawer.getByTestId('family-drawer-stock')).toContainText('5 bouteilles');
    await expect(line.first()).toContainText('×5');
    await expect(drawer.getByTestId('line-pending').first()).toBeVisible();

    const synced = page.waitForResponse((r) => r.url().endsWith(`/api/inventory/${group.id}/correct`));
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    expect((await synced).status()).toBe(200);

    await expect(drawer.getByTestId('line-pending')).toHaveCount(0);
    await expect(drawer.getByTestId('family-history')).toContainText('Nombre corrigé : 6 → 5 (cassée, offerte ou perdue)');
    const units = await unitsOf(api, group.productId);
    expect(units.find((unit) => unit.id === group.id)?.quantity).toBe(5);
    expect(units.filter((unit) => unit.writtenOffAt != null)).toHaveLength(1);
  });

  test('c4: changed elsewhere meanwhile, the opening goes to the conflict dialog and is not applied', async ({ page, context }) => {
    const api = page.request;
    const name = `E2E N conflict ${stamp()}`;
    const group = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'wine', name, producer: 'E2E Domaine', purchasePrice: 20, quantity: 6 },
    }));
    families.push(group.productId);
    const drawer = await openDrawer(page, group.productId, name);

    await goOffline(context, page);
    await drawer.getByTestId('stock-move-open').click();
    await expect(drawer.getByTestId('family-drawer-stock')).toContainText('5 pleines · 1 entamée');

    // Another member corrects the line to ×4 meanwhile (the test's own API
    // calls do not go through the browser, which stays cut).
    await okData(await api.post(`/api/inventory/${group.id}/correct`, { data: { quantity: 4, reason: 'input_error' } }));

    const refused = page.waitForResponse((r) => r.url().endsWith(`/api/inventory/${group.id}`) && r.request().method() === 'PATCH');
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    expect((await refused).status()).toBe(409);

    const conflict = dialogTitled(page, 'Conflit de synchronisation');
    await expect(conflict.getByTestId('conflict-action')).toContainText("J'en ouvre une");
    await expect(conflict.getByTestId('conflict-action')).toContainText('×6 quand vous avez agi, ×4 maintenant');
    await conflict.getByRole('button', { name: 'Garder la version serveur' }).click();
    await expect(conflict).toBeHidden();

    await expect(drawer.getByTestId('family-drawer-stock')).toContainText('4 bouteilles');
    const units = await unitsOf(api, group.productId);
    expect(units.map((unit) => [unit.id, unit.quantity, unit.isOpened])).toEqual([[group.id, 4, false]]);
  });
});
