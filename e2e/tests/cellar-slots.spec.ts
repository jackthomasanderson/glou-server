import { test, expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';

/**
 * FEAT-93 (#847, lot S3): the cellar plan, one cell per bottle. Criterion 1
 * (a group x6 placed in 6 cells shows in those 6 cells) and criterion 2
 * (2 placed of 6 reads "2 rangées, 4 non rangées"; a 7th is refused with an
 * explanation), through the plan's interface on the real stack. A cell
 * touched opens the wine on its line, with the cell named.
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

/** French puts a (non-breaking) space before « : ». */
const cellName = (column: number, row: number, rest: string) => new RegExp(`^Colonne ${column}, rangée ${row}\\s:\\s${rest}`);

const emptyCell = (page: Page, column: number, row: number) =>
  page.getByRole('button', { name: cellName(column, row, 'vide') });
const heldCell = (page: Page, column: number, row: number, wine: string) =>
  page.getByRole('button', { name: cellName(column, row, wine) });

test.describe('the cellar plan, one cell per bottle (FEAT-93)', () => {
  let productId: string | null = null;
  let cellarId: string | null = null;
  test.afterEach(async ({ page }) => {
    if (productId) await page.request.delete(`/api/products/${productId}`).catch(() => {});
    if (cellarId) await page.request.delete(`/api/cellars/${cellarId}`).catch(() => {});
    productId = null;
    cellarId = null;
  });

  async function cellarWithSix(api: APIRequestContext, wine: string): Promise<string> {
    cellarId = (await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E plan ${stamp()}`, columns: 3, rows: 3 } }))).id;
    const unit = await okData<{ id: string; productId: string }>(await api.post('/api/inventory', {
      data: { category: 'wine', name: wine, producer: 'E2E Domaine', purchasePrice: 20, cellarId },
    }));
    productId = unit.productId;
    await okData(await api.patch(`/api/inventory/${unit.id}`, { data: { quantity: 6 } }));
    return unit.id;
  }

  /** "Assigner" from an empty cell: the line of the wine, with its placement. */
  async function openAssign(page: Page, column: number, row: number, wine: string) {
    await emptyCell(page, column, row).click();
    const dialog = page.getByRole('dialog').filter({ hasText: `C${column}·R${row}` });
    const line = dialog.getByRole('button').filter({ hasText: wine });
    await expect(line).toBeVisible();
    return { dialog, line };
  }

  test('c1-c2: 2 placed read "2 rangées, 4 non rangées"; 6 placed show in their 6 cells; a 7th is refused with why', async ({ page }) => {
    const api = page.request;
    const wine = `E2E Plan ${stamp()}`;
    const itemId = await cellarWithSix(api, wine);
    await page.goto(`/cellars/${cellarId}`);

    // Nothing placed: "6 non rangées".
    let assign = await openAssign(page, 1, 1, wine);
    await expect(assign.line.getByTestId('assign-placement')).toHaveText('6 non rangées');
    await assign.line.click();
    await expect(heldCell(page, 1, 1, wine)).toBeVisible();

    assign = await openAssign(page, 2, 1, wine);
    await assign.line.click();
    await expect(heldCell(page, 2, 1, wine)).toBeVisible();

    // c2: two placed of six.
    assign = await openAssign(page, 3, 1, wine);
    await expect(assign.line.getByTestId('assign-placement')).toHaveText('2 rangées, 4 non rangées');
    await assign.line.click();
    for (const [column, row] of [[1, 2], [2, 2]] as const) {
      await (await openAssign(page, column, row, wine)).line.click();
      await expect(heldCell(page, column, row, wine)).toBeVisible();
    }

    // The last copy is placed from another device while "Assigner" is open here.
    assign = await openAssign(page, 3, 2, wine);
    await expect(assign.line.getByTestId('assign-placement')).toHaveText('5 rangées, 1 non rangée');
    expect((await api.post(`/api/inventory/${itemId}/slots`, { data: { column: 1, row: 3 } })).status()).toBe(201);
    await assign.line.click();
    // c2: the 7th is refused, with why.
    await expect(assign.dialog.getByRole('alert')).toContainText('Les 6 bouteilles de cette ligne sont déjà rangées.');
    await assign.dialog.getByRole('button', { name: 'Annuler' }).click();

    // c1: the six cells, and only them, hold the wine; the counter counts cells.
    for (const [column, row] of [[1, 1], [2, 1], [3, 1], [1, 2], [2, 2], [1, 3]] as const) {
      await expect(heldCell(page, column, row, wine)).toBeVisible();
    }
    await expect(page.getByRole('button', { name: new RegExp(`^Colonne \\d, rangée \\d\\s:\\s${wine}`) })).toHaveCount(6);
    await expect(emptyCell(page, 3, 2)).toBeVisible();
    await expect(page.getByText(/^6 \/ 9 occupés$/)).toBeVisible();
  });

  test('a cell touched opens its wine on the line, names the cell and takes the bottle out of it', async ({ page }) => {
    const api = page.request;
    const wine = `E2E Plan ${stamp()}`;
    const itemId = await cellarWithSix(api, wine);
    for (const column of [1, 2]) expect((await api.post(`/api/inventory/${itemId}/slots`, { data: { column, row: 3 } })).status()).toBe(201);
    await page.goto(`/cellars/${cellarId}`);

    await heldCell(page, 2, 3, wine).click();
    const drawer = page.getByRole('dialog').filter({ has: page.locator('#inventory-detail-title') });
    const banner = drawer.getByTestId('slot-context');
    await expect(banner).toHaveText(/Case C2·R3/);
    await banner.getByRole('button', { name: 'Retirer de la case' }).click();
    await expect(banner).toHaveCount(0);
    await expect(drawer.getByTestId('slot-removed')).toHaveText('Bouteille retirée de la case.');
    await drawer.getByRole('button', { name: 'Fermer' }).first().click();

    // The focus comes back to the cell touched, now empty — never the page body.
    await expect(emptyCell(page, 2, 3)).toBeFocused();
    await expect(heldCell(page, 1, 3, wine)).toBeVisible();
    await expect(page.getByText(/^1 \/ 9 occupé$/)).toBeVisible();
  });

  // Review of #855: a swap shows what the server does (the bottles swap, each slot stays in
  // its cell), and two cells of the same line never swap (no request, no false history).
  test('with the keyboard: two wines swap their cells; two cells of the same wine stay as they are', async ({ page }) => {
    const api = page.request;
    const wine = `E2E Plan ${stamp()}`;
    const itemId = await cellarWithSix(api, wine);
    const other = await okData<{ id: string; productId: string }>(await api.post('/api/inventory', {
      data: { category: 'wine', name: `E2E Autre ${stamp()}`, producer: 'E2E Domaine', purchasePrice: 30, cellarId },
    }));
    for (const column of [1, 2]) expect((await api.post(`/api/inventory/${itemId}/slots`, { data: { column, row: 1 } })).status()).toBe(201);
    expect((await api.post(`/api/inventory/${other.id}/slots`, { data: { column: 3, row: 1 } })).status()).toBe(201);
    const swaps: string[] = [];
    page.on('request', (request) => { if (request.url().includes('/swap-slots')) swaps.push(request.url()); });
    try {
      await page.goto(`/cellars/${cellarId}`);
      // dnd-kit's keyboard drag, step by step as its screen-reader announcements say.
      const said = page.getByRole('status').filter({ hasText: wine.split(' ')[0] });
      const drag = async (column: number, row: number, name: string) => {
        await heldCell(page, column, row, name).focus();
        await page.keyboard.press('Space');
        await expect(said.filter({ hasText: `au-dessus de la colonne ${column}, rangée ${row}` })).toHaveCount(1);
        // dnd-kit measures the cells just after the pick-up: an arrow pressed before moves nothing, press again.
        await expect(async () => {
          if (await said.filter({ hasText: `au-dessus de la colonne ${column}, rangée ${row}` }).count() > 0) await page.keyboard.press('ArrowRight');
          await expect(said.filter({ hasText: `au-dessus de la colonne ${column + 1}, rangée ${row}` })).toHaveCount(1, { timeout: 500 });
        }).toPass();
        await page.keyboard.press('Space');
      };

      // C1·R1 onto C2·R1: the same wine — nothing is sent.
      await drag(1, 1, wine);
      await expect(heldCell(page, 1, 1, wine)).toBeVisible();
      await expect(heldCell(page, 2, 1, wine)).toBeVisible();

      // C2·R1 onto C3·R1: the other wine — they swap, and stay swapped once the plan reloads.
      await drag(2, 1, wine);
      await expect(heldCell(page, 3, 1, wine)).toBeVisible();
      await expect(heldCell(page, 2, 1, 'E2E Autre')).toBeVisible();
      await page.reload();
      await expect(heldCell(page, 3, 1, wine)).toBeVisible();
      await expect(heldCell(page, 2, 1, 'E2E Autre')).toBeVisible();
      expect(swaps).toHaveLength(1);
    } finally {
      await api.delete(`/api/products/${other.productId}`).catch(() => {});
    }
  });
});
