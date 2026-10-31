import { test, expect, type APIRequestContext, type APIResponse, type Locator, type Page } from '@playwright/test';

/**
 * #471 (lot W3, ux-ui.md §10.3-§10.4): the menu of one line of bottles in
 * the drawer of a wine — "Corriger le nombre" with each reason (FEAT-92 c3),
 * "Mettre à la corbeille" a whole line, "Modifier" a line's own values
 * (#726: an emptied price or opening day is really emptied), "Déplacer" and
 * "Changer le prix" part of a line (FEAT-98 c1, c4, c5).
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

type Unit = {
  id: string; productId: string; cellarId: string | null; quantity: number | null; purchasePrice: number | null;
  isOpened: boolean; openedAt: string | null; writtenOffAt: string | null; deletedAt: string | null;
};
type Written = { data: Unit; changed: Unit[]; removedIds: string[] };

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

/** A budget envelope over the current month, and how much it has spent. */
async function monthEnvelope(api: APIRequestContext): Promise<{ id: string; spent: () => Promise<number> }> {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0');
  const { id } = await okData<{ id: string }>(await api.post('/api/wishlist/budget-envelopes', {
    data: {
      periodStart: new Date(`${now.getFullYear()}-${month}-01`).toISOString(),
      periodEnd: new Date(`${now.getFullYear()}-${month}-${lastDay}`).toISOString(),
      amount: 1000,
    },
  }));
  return {
    id,
    spent: async () => (await okData<{ spent: number }>(await api.get(`/api/wishlist/budget-envelopes/${id}/progress`))).spent,
  };
}

/** The drawer of a wine, opened from its link. */
async function openDrawer(page: Page, productId: string, name: string): Promise<Locator> {
  await page.goto(`/bottles?scan=${encodeURIComponent(productId)}`);
  const drawer = page.getByRole('dialog').filter({ has: page.locator('#inventory-detail-title') });
  await expect(drawer.locator('#inventory-detail-title')).toHaveText(name);
  // The page done loading behind it: a menu opened meanwhile closes again.
  await page.waitForLoadState('networkidle');
  return drawer;
}

/** Picks an action in the menu of one line of the drawer. */
async function lineAction(page: Page, line: Locator, action: string): Promise<void> {
  await line.getByRole('button', { name: 'Actions de cette ligne' }).click();
  // By CSS: like a Select's options (#727), the open menu is drawn but kept
  // out of the accessibility tree while the drawer is open.
  await page.locator('[role="menuitem"]').filter({ hasText: action }).click();
}

const dialogTitled = (page: Page, title: string) =>
  page.getByRole('dialog').filter({ has: page.locator('header', { hasText: title }) });

test.describe('the actions of a line in the drawer of a wine (#471, W3)', () => {
  const families: string[] = [];
  const envelopes: string[] = [];
  const cellars: string[] = [];
  test.afterEach(async ({ page }) => {
    const api = page.request;
    for (const productId of families.splice(0)) await api.delete(`/api/products/${productId}`).catch(() => {});
    for (const cellarId of cellars.splice(0)) await api.delete(`/api/cellars/${cellarId}`).catch(() => {});
    for (const id of envelopes.splice(0)) await api.delete(`/api/wishlist/budget-envelopes/${id}`).catch(() => {});
  });

  /** A wine of `count` bottles at 20 €: one group, bought today. */
  async function wineOfSix(api: APIRequestContext, name: string): Promise<Unit> {
    const first = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'wine', name, producer: 'E2E Domaine', purchasePrice: 20 },
    }));
    families.push(first.productId);
    const group = (await okData<Unit>(await api.post(`/api/products/${first.productId}/items`, { data: { quantity: 5, purchasePrice: 20 } })));
    expect(group).toMatchObject({ id: first.id, quantity: 6 });
    return group;
  }

  for (const { reason, spentDrop, gone } of [
    { reason: 'Erreur de saisie', spentDrop: 40, gone: false },
    { reason: 'Cassée, offerte ou perdue', spentDrop: 0, gone: true },
  ]) {
    // FEAT-92 c3: 6 → 4, each reason, from the line's menu.
    test(`correcting 6 → 4, "${reason}"`, async ({ page }) => {
      const api = page.request;
      const envelope = await monthEnvelope(api);
      envelopes.push(envelope.id);
      const name = `E2E W3 correct ${stamp()}`;
      const group = await wineOfSix(api, name);
      const spentBefore = await envelope.spent();

      const drawer = await openDrawer(page, group.productId, name);
      const line = drawer.getByTestId('family-line');
      await expect(line).toHaveCount(1);
      await lineAction(page, line, 'Corriger le nombre');

      const dialog = dialogTitled(page, 'Corriger le nombre');
      const number = dialog.getByLabel('Nombre de bouteilles');
      await expect(number).toHaveValue('6');
      await number.fill('4');
      // No reason chosen in advance: nothing can be sent yet.
      const confirm = dialog.getByRole('button', { name: 'Corriger', exact: true });
      await expect(confirm).toBeDisabled();
      await dialog.getByRole('radio', { name: reason }).check();

      const sent = page.waitForResponse((r) => r.url().endsWith(`/api/inventory/${group.id}/correct`));
      await confirm.click();
      const res = await sent;
      expect(res.status(), await res.text()).toBe(200);
      await expect(dialog).toBeHidden();

      // The drawer at once: ×4, and the 2 gone when broken / given away / lost.
      await expect(drawer.getByTestId('family-drawer-stock')).toContainText('4 bouteilles');
      await expect(line).toContainText('×4');
      if (gone) {
        await expect(drawer.getByText('2 cassées, offertes ou perdues')).toBeVisible();
        await expect(drawer.getByTestId('family-history')).toContainText('Nombre corrigé : 6 → 4 (cassée, offerte ou perdue)');
      } else {
        await expect(drawer.getByTestId('family-history')).toContainText('Nombre corrigé : 6 → 4 (erreur de saisie)');
      }
      expect(spentBefore - await envelope.spent()).toBe(spentDrop);
    });
  }

  test('down to 0 by an input error, the line goes to the trash instead', async ({ page }) => {
    const api = page.request;
    const name = `E2E W3 zero ${stamp()}`;
    const group = await wineOfSix(api, name);
    const drawer = await openDrawer(page, group.productId, name);
    await lineAction(page, drawer.getByTestId('family-line'), 'Corriger le nombre');
    const dialog = dialogTitled(page, 'Corriger le nombre');
    await dialog.getByLabel('Nombre de bouteilles').fill('0');
    await dialog.getByRole('radio', { name: 'Erreur de saisie' }).check();
    await dialog.getByRole('button', { name: 'Mettre ces bouteilles à la corbeille' }).click();

    const trash = dialogTitled(page, 'Mettre à la corbeille ?');
    await expect(trash).toContainText('Mettre ces 6 bouteilles');
    const deleted = page.waitForResponse((r) => r.url().endsWith(`/api/inventory/${group.id}`) && r.request().method() === 'DELETE');
    await trash.getByRole('button', { name: 'Mettre à la corbeille' }).click();
    expect((await deleted).status()).toBe(200);
    await expect(drawer.getByText('Plus aucune bouteille en cave.')).toBeVisible();
  });

  // §10.4.7: the whole line, its number said; restored, it comes back whole.
  test('trashing one line of a wine of two lines', async ({ page }) => {
    const api = page.request;
    const name = `E2E W3 trash ${stamp()}`;
    const group = await wineOfSix(api, name);
    const other = (await okData<Unit>(await api.post(`/api/products/${group.productId}/items`, { data: { quantity: 2, purchasePrice: 25 } })));

    const drawer = await openDrawer(page, group.productId, name);
    await expect(drawer.getByTestId('family-drawer-stock')).toContainText('8 bouteilles');
    const line = drawer.getByTestId('family-line').filter({ hasText: '×2' });
    await lineAction(page, line, 'Mettre à la corbeille');
    const dialog = dialogTitled(page, 'Mettre à la corbeille ?');
    await expect(dialog).toContainText(/Mettre ces 2 bouteilles \(Sans cave · 25\s€ \/ bouteille\) à la corbeille \?/);

    const deleted = page.waitForResponse((r) => r.url().endsWith(`/api/inventory/${other.id}`) && r.request().method() === 'DELETE');
    await dialog.getByRole('button', { name: 'Mettre à la corbeille' }).click();
    expect((await deleted).status()).toBe(200);
    await expect(drawer.getByTestId('family-line')).toHaveCount(1);
    await expect(drawer.getByTestId('family-drawer-stock')).toContainText('6 bouteilles');

    // Restored, the line comes back with its 2 bottles.
    await okData(await api.post(`/api/inventory/${other.id}/restore`));
    const lines = (await okData<{ items: Unit[] }>(await api.get(`/api/products/${group.productId}`))).items;
    expect(lines.map((unit) => unit.quantity).sort()).toEqual([2, 6]);
  });

  // #726, moved here by #471: a line's own price and opening day, emptied, are empty.
  test('emptying the price and the opening day of an opened bottle clears them', async ({ page }) => {
    const api = page.request;
    const name = `E2E W3 #726 ${stamp()}`;
    const opened = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'wine', name, producer: 'E2E Domaine', purchasePrice: 20, isOpened: true, fillLevel: 50, openedAt: '2026-01-10' },
    }));
    families.push(opened.productId);

    const drawer = await openDrawer(page, opened.productId, name);
    await lineAction(page, drawer.getByTestId('family-line'), 'Modifier');
    const dialog = dialogTitled(page, 'Modifier cette ligne');
    const price = dialog.getByLabel("Prix d'une bouteille");
    await expect(price).toHaveValue('20');
    await price.fill('');
    const openedOn = dialog.getByLabel('Ouverte le');
    await expect(openedOn).toHaveValue('2026-01-10');
    await openedOn.fill('');

    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/inventory/${opened.id}`) && r.request().method() === 'PATCH');
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    const res = await saved;
    expect(res.status(), await res.text()).toBe(200);
    expect(res.request().postDataJSON()).toMatchObject({ purchasePrice: null, openedAt: null });
    await expect(dialog).toBeHidden();

    const item = await okData<Unit & { fillLevel: number }>(await api.get(`/api/inventory/${opened.id}`));
    expect(item.purchasePrice).toBeNull();
    expect(item.openedAt).toBeNull();
    // Its state untouched: still opened, at its level.
    expect(item).toMatchObject({ isOpened: true, fillLevel: 50 });
  });

  test('a line\'s purchase day is set from its "Modifier"', async ({ page }) => {
    const api = page.request;
    const name = `E2E W3 day ${stamp()}`;
    const group = await wineOfSix(api, name);
    const drawer = await openDrawer(page, group.productId, name);
    await lineAction(page, drawer.getByTestId('family-line'), 'Modifier');
    const dialog = dialogTitled(page, 'Modifier cette ligne');
    await expect(dialog).toContainText("S'applique aux 6 bouteilles de cette ligne.");
    await dialog.getByLabel("Date d'achat").fill('2025-12-24');
    await dialog.getByLabel('Emplacement').fill('Étagère du haut');
    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/inventory/${group.id}`) && r.request().method() === 'PATCH');
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    expect((await saved).status()).toBe(200);
    await expect(dialog).toBeHidden();

    const [unit] = (await okData<{ items: Array<Unit & { purchasedAt: string | null; location: string | null }> }>(await api.get(`/api/products/${group.productId}`))).items;
    expect(unit).toMatchObject({ purchasedAt: '2025-12-24', location: 'Étagère du haut', quantity: 6 });
    await expect(drawer.getByTestId('family-line')).toContainText('Étagère du haut');
  });
  // FEAT-98 c1 (and c4 in the dialog): "Combien déplacer ?", 2 of 6, to the kitchen.
  test('moving 2 of 6 bottles to another cellar splits the line', async ({ page }) => {
    const api = page.request;
    const kitchen = (await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E W3 Cuisine ${stamp()}` } }))).id;
    cellars.push(kitchen);
    const name = `E2E W3 move ${stamp()}`;
    const group = await wineOfSix(api, name);

    const drawer = await openDrawer(page, group.productId, name);
    await lineAction(page, drawer.getByTestId('family-line'), 'Déplacer');
    const dialog = dialogTitled(page, 'Déplacer');
    const count = dialog.getByLabel('Combien déplacer ?');
    await expect(count).toHaveValue('6');
    // c4: never more than the line holds.
    await count.fill('7');
    await dialog.getByRole('radio', { name: /^E2E W3 Cuisine/ }).check();
    const confirm = dialog.getByRole('button', { name: 'Déplacer', exact: true });
    await expect(confirm).toBeDisabled();
    await count.fill('2');

    const sent = page.waitForResponse((r) => r.url().endsWith(`/api/inventory/${group.id}/move`));
    await confirm.click();
    const res = await sent;
    expect(res.status(), await res.text()).toBe(200);
    expect(res.request().postDataJSON()).toMatchObject({ count: 2, cellarId: kitchen });
    await expect(dialog).toBeHidden();

    // The drawer at once: ×4 where they were, ×2 in the kitchen, still 6 bottles.
    await expect(drawer.getByTestId('family-line')).toHaveCount(2);
    await expect(drawer.getByTestId('family-line').filter({ hasText: '×4' })).toContainText('Sans cave');
    await expect(drawer.getByTestId('family-line').filter({ hasText: '×2' })).toContainText('E2E W3 Cuisine');
    await expect(drawer.getByTestId('family-drawer-stock')).toContainText('6 bouteilles');
    await expect(drawer.getByTestId('family-history')).toContainText(/2 bouteilles déplacées vers E2E W3 Cuisine/);
  });

  // FEAT-98 c5: "Pour combien de bouteilles ?", 2 of 6 from 20 € to 25 €.
  test('changing the price of 2 of 6 bottles splits the line', async ({ page }) => {
    const api = page.request;
    const name = `E2E W3 reprice ${stamp()}`;
    const group = await wineOfSix(api, name);

    const drawer = await openDrawer(page, group.productId, name);
    await lineAction(page, drawer.getByTestId('family-line'), 'Changer le prix');
    const dialog = dialogTitled(page, 'Changer le prix');
    const count = dialog.getByLabel('Pour combien de bouteilles ?');
    await expect(count).toHaveValue('6');
    await count.fill('2');
    const price = dialog.getByLabel("Prix d'une bouteille");
    await expect(price).toHaveValue('20');
    await price.fill('');
    await price.pressSequentially('25');

    const sent = page.waitForResponse((r) => r.url().endsWith(`/api/inventory/${group.id}/reprice`));
    await dialog.getByRole('button', { name: 'Changer le prix', exact: true }).click();
    const res = await sent;
    expect(res.status(), await res.text()).toBe(200);
    expect(res.request().postDataJSON()).toMatchObject({ count: 2, purchasePrice: 25 });
    await expect(dialog).toBeHidden();

    await expect(drawer.getByTestId('family-line')).toHaveCount(2);
    await expect(drawer.getByTestId('family-line').filter({ hasText: '×4' })).toContainText(/20\s€ \/ bouteille/);
    await expect(drawer.getByTestId('family-line').filter({ hasText: '×2' })).toContainText(/25\s€ \/ bouteille/);
    await expect(drawer.getByTestId('family-history')).toContainText(/Prix de 2 bouteilles : 20(,00)?\s€ → 25(,00)?\s€/);
    const lines = (await okData<{ items: Unit[] }>(await api.get(`/api/products/${group.productId}`))).items;
    expect(lines.map((unit) => [unit.quantity, unit.purchasePrice]).sort()).toEqual([[2, 25], [4, 20]]);
  });

  // design.md rule 4 (W3 review): a line edited, or a value restored, into an
  // identical line joins it — never two "Garage · 20 € · oct." lines.
  test('a line whose purchase day becomes another line\'s joins it, edited or restored', async ({ page }) => {
    const api = page.request;
    const group = await wineOfSix(api, `E2E W3 join ${stamp()}`);
    const linesOf = async () => (await okData<{ items: Array<Unit & { purchasedAt: string | null }> }>(await api.get(`/api/products/${group.productId}`))).items
      .filter((unit) => !unit.writtenOffAt).map((unit) => [unit.quantity, unit.purchasedAt]).sort();
    const today = (await okData<{ items: Array<Unit & { purchasedAt: string }> }>(await api.get(`/api/products/${group.productId}`))).items[0].purchasedAt;

    // Edited: a ×2 bought another day, given the ×6's day.
    const other = await okData<Unit>(await api.post(`/api/products/${group.productId}/items`, { data: { quantity: 2, purchasePrice: 20, purchasedAt: '2025-09-01' } }));
    expect(other.id).not.toBe(group.id);
    const edited = await api.patch(`/api/inventory/${other.id}`, { data: { purchasedAt: today } });
    expect(edited.status(), await edited.text()).toBe(200);
    const write = (await edited.json()) as Written;
    expect(write.data).toMatchObject({ id: group.id, quantity: 8 });
    expect(write.removedIds).toEqual([other.id]);
    expect(await linesOf()).toEqual([[8, today]]);

    // Restored: a ×2 moved to another day, the ×8 then given its old day, the ×2's day restored.
    const third = await okData<Unit>(await api.post(`/api/products/${group.productId}/items`, { data: { quantity: 2, purchasePrice: 20, purchasedAt: '2025-08-01' } }));
    await okData(await api.patch(`/api/inventory/${third.id}`, { data: { purchasedAt: '2025-07-01' } }));
    await okData(await api.patch(`/api/inventory/${group.id}`, { data: { purchasedAt: '2025-08-01' } }));
    expect(await linesOf()).toEqual([[2, '2025-07-01'], [8, '2025-08-01']]);
    const restored = await api.post(`/api/inventory/${third.id}/rollback`, { data: { field: 'purchasedAt', toValue: '2025-08-01T00:00:00.000Z' } });
    expect(restored.status(), await restored.text()).toBe(200);
    expect(await linesOf()).toEqual([[10, '2025-08-01']]);
  });
  // design.md rule 4 (W3 re-review): two lines whose places of purchase
  // contradict never join — one place would be lost.
  test('a line edited into another one\'s day stays apart when their places of purchase differ', async ({ page }) => {
    const api = page.request;
    const group = await wineOfSix(api, `E2E W3 places ${stamp()}`);
    await okData(await api.patch(`/api/inventory/${group.id}`, { data: { purchasePlace: 'Caviste A' } }));
    const detail = await okData<{ items: Array<Unit & { purchasedAt: string }> }>(await api.get(`/api/products/${group.productId}`));
    const today = detail.items[0].purchasedAt;
    const other = await okData<Unit>(await api.post(`/api/products/${group.productId}/items`, { data: { quantity: 2, purchasePrice: 20, purchasedAt: '2025-09-01' } }));
    await okData(await api.patch(`/api/inventory/${other.id}`, { data: { purchasePlace: 'Caviste B' } }));

    const edited = (await (await api.patch(`/api/inventory/${other.id}`, { data: { purchasedAt: today } })).json()) as Written;
    expect(edited.data.id).toBe(other.id);
    expect(edited.removedIds).toEqual([]);
    const lines = (await okData<{ items: Array<Unit & { purchasePlace: string | null }> }>(await api.get(`/api/products/${group.productId}`))).items
      .map((unit) => [unit.quantity, unit.purchasePlace]).sort();
    expect(lines).toEqual([[2, 'Caviste B'], [6, 'Caviste A']]);
  });

  test('bottles moved to a cellar whose identical line was bought elsewhere make a line of their own', async ({ page }) => {
    const api = page.request;
    const kitchen = (await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E W3 Cuisine ${stamp()}` } }))).id;
    cellars.push(kitchen);
    const group = await wineOfSix(api, `E2E W3 move places ${stamp()}`);
    await okData(await api.patch(`/api/inventory/${group.id}`, { data: { purchasePlace: 'Caviste A' } }));
    const there = await okData<Unit>(await api.post(`/api/products/${group.productId}/items`, { data: { quantity: 1, purchasePrice: 20, cellarId: kitchen } }));
    await okData(await api.patch(`/api/inventory/${there.id}`, { data: { purchasePlace: 'Caviste B' } }));

    const moved = await api.post(`/api/inventory/${group.id}/move`, { data: { count: 2, cellarId: kitchen } });
    expect(moved.status(), await moved.text()).toBe(200);
    const lines = (await okData<{ items: Array<Unit & { purchasePlace: string | null }> }>(await api.get(`/api/products/${group.productId}`))).items
      .map((unit) => [unit.cellarId === kitchen ? 'kitchen' : 'none', unit.quantity, unit.purchasePlace]).sort();
    expect(lines).toEqual([['kitchen', 1, 'Caviste B'], ['kitchen', 2, 'Caviste A'], ['none', 4, 'Caviste A']]);
  });
});
