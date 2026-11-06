import { test, expect, type APIResponse, type Locator, type Page } from '@playwright/test';

/**
 * Recette n°5 ter of #847.
 * 1. After closing a drawer or a window, the first click did nothing (a
 *    plan's cell, a link of the side menu): the closed window stayed in the
 *    page while it slid away, its full-screen layer catching the click.
 * 2-3. A message beside a drawer slid sideways over the drawer's
 *    « Ajouter des bouteilles » / « Modifier » when it left, catching a click
 *    meant for them; « Annuler » must stay its full 8 seconds wherever the
 *    message goes.
 *
 * Clicks go through `page.mouse` at the spot, right after the closing — a
 * locator's click would wait for the spot to be free, which hides the defect.
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

/** French puts a (non-breaking) space before « : ». */
const cell = (page: Page, column: number, row: number, rest: string) =>
  page.getByRole('button', { name: new RegExp(`^Colonne ${column}, rangée ${row}\\s:\\s${rest}`) });

async function centre(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

/** The element the browser would give a click at that spot. */
const hitAt = (page: Page, point: { x: number; y: number }) =>
  page.evaluate(({ x, y }) => {
    const hit = document.elementFromPoint(x, y);
    return hit?.closest('[data-slot="wrapper"]') ? 'closing window' : hit?.closest('[role="button"], a, button')?.getAttribute('aria-label') ?? hit?.closest('a')?.getAttribute('href') ?? hit?.tagName ?? 'nothing';
  }, point);

test.describe('closing a drawer, a window or a message never takes a click (recette n°5 ter of #847)', () => {
  test.use({ viewport: { width: 1471, height: 833 } });
  let cellarId: string | null = null;
  let productId: string | null = null;
  test.afterEach(async ({ page }) => {
    if (productId) await page.request.delete(`/api/products/${productId}`).catch(() => {});
    if (cellarId) await page.request.delete(`/api/cellars/${cellarId}`).catch(() => {});
    productId = null;
    cellarId = null;
  });

  /** A 4×3 plan, a wine ×4 placed in C1·R1 to C4·R1 (+ `unplaced` not placed). */
  async function planWithFour(page: Page, unplaced = 0) {
    const api = page.request;
    cellarId = (await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E R7C ${stamp()}`, columns: 4, rows: 3 } }))).id;
    const name = `E2E R7C ${stamp()}`;
    const unit = await okData<{ id: string; productId: string }>(await api.post('/api/inventory', {
      data: { category: 'wine', name, producer: 'E2E Domaine', purchasePrice: 20, quantity: 4 + unplaced, cellarId },
    }));
    productId = unit.productId;
    for (const column of [1, 2, 3, 4]) expect((await api.post(`/api/inventory/${unit.id}/slots`, { data: { column, row: 1 } })).status()).toBe(201);
    await page.goto(`/cellars/${cellarId}`);
    await expect(cell(page, 1, 1, name)).toBeVisible();
    await page.waitForLoadState('networkidle');
    return name;
  }

  const drawerOf = (page: Page) => page.getByRole('dialog').filter({ has: page.locator('#inventory-detail-title') });
  const openedAt = (page: Page, column: number, row: number) =>
    drawerOf(page).getByTestId('slot-context').filter({ hasText: `C${column}·R${row}` });

  async function openFromCell(page: Page, name: string, column: number, row: number) {
    const at = await centre(cell(page, column, row, name));
    await page.mouse.click(at.x, at.y);
    await expect(openedAt(page, column, row)).toBeVisible();
    // Fully in: the closing below is the only animation running.
    await page.waitForTimeout(500);
  }

  async function closeDrawer(page: Page) {
    const cross = await centre(drawerOf(page).getByRole('button', { name: 'Fermer' }).first());
    await page.mouse.click(cross.x, cross.y);
  }

  test('the drawer closed, the very next click opens another cell', async ({ page }) => {
    const name = await planWithFour(page);
    // Measured before: the page under a drawer is hidden from the accessibility tree.
    const cells = new Map<number, { x: number; y: number }>();
    for (const column of [2, 3]) cells.set(column, await centre(cell(page, column, 1, name)));
    for (const [column, next] of [[1, 3], [3, 2]] as const) {
      await openFromCell(page, name, column, 1);
      const target = cells.get(next)!;
      await closeDrawer(page);
      // At once: the drawer is still sliding away, and must not stand in the way.
      expect(await hitAt(page, target)).toMatch(new RegExp(`^Colonne ${next}, rangée 1`));
      await page.mouse.click(target.x, target.y);
      await expect(openedAt(page, next, 1)).toBeVisible();
      await closeDrawer(page);
      await expect(drawerOf(page)).toHaveCount(0);
    }
  });

  test('the drawer closed, the very next click on the side menu leaves the page', async ({ page }) => {
    const name = await planWithFour(page);
    await openFromCell(page, name, 2, 1);
    const link = page.locator('nav a[href^="/bottles"]').first();
    const target = await centre(link);
    await closeDrawer(page);
    await page.mouse.click(target.x, target.y);
    await expect(page).toHaveURL(/\/bottles/);
  });

  test('a bottle placed from an empty cell, the very next click opens a cell', async ({ page }) => {
    const name = await planWithFour(page, 1);
    const target = await centre(cell(page, 3, 1, name));
    const empty = await centre(page.getByRole('button', { name: /^Colonne 1, rangée 2\s:\svide/ }));
    await page.mouse.click(empty.x, empty.y);
    const assign = page.getByRole('dialog').filter({ hasText: 'C1·R2' });
    const line = assign.getByRole('button').filter({ hasText: name });
    await expect(line).toBeVisible();
    await page.waitForTimeout(500);
    const lineAt = await centre(line);
    await page.mouse.click(lineAt.x, lineAt.y);
    // Closed, still sliding away.
    await expect(page.locator('[aria-modal="true"][data-open]')).toHaveCount(0);
    expect(await hitAt(page, target)).toMatch(/^Colonne 3, rangée 1/);
    await page.mouse.click(target.x, target.y);
    await expect(openedAt(page, 3, 1)).toBeVisible();
  });

  test('a message beside the drawer leaves without passing over its actions, nor taking a click', async ({ page }) => {
    const name = await planWithFour(page);
    await openFromCell(page, name, 1, 1);
    const drawer = drawerOf(page);
    await drawer.getByTestId('add-units-button').click();
    const add = page.getByRole('dialog').filter({ has: page.getByTestId('add-units-submit') });
    await add.getByTestId('add-units-quantity').fill('3');
    await add.getByTestId('add-units-submit').click();
    const toast = page.locator('[data-toast]').filter({ hasText: '3 bouteilles ajoutées' });
    await expect(toast).toBeVisible();
    await expect(add).toHaveCount(0);

    // Its whole life, drawn frame by frame: never over the drawer; leaving, never in the way of a click.
    const frames = await page.evaluate(async () => {
      const seen: { overDrawer: boolean; exiting: boolean; catches: boolean }[] = [];
      const drawer = document.querySelector('#inventory-detail-title')!.closest('section')!.getBoundingClientRect();
      const started = performance.now();
      while (performance.now() - started < 6000) {
        const message = Array.from(document.querySelectorAll<HTMLElement>('[data-toast]')).find((element) => element.textContent?.includes('3 bouteilles ajoutées'));
        if (!message) break;
        const box = message.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        seen.push({
          overDrawer: box.right > drawer.left + 1 && box.bottom > drawer.top && box.top < drawer.bottom,
          exiting: message.dataset.toastExiting === 'true',
          catches: !!hit && message.contains(hit),
        });
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return seen;
    });
    const leaving = frames.filter((frame) => frame.exiting);
    expect(leaving.length, 'the message was seen leaving').toBeGreaterThan(2);
    expect(frames.filter((frame) => frame.overDrawer)).toEqual([]);
    expect(leaving.filter((frame) => frame.catches)).toEqual([]);
    await expect(toast).toHaveCount(0);
  });

  test('« Annuler » stays its 8 seconds while the drawer closes and opens again', async ({ page }) => {
    const name = await planWithFour(page);
    await openFromCell(page, name, 1, 1);
    await drawerOf(page).getByTestId('stock-move-open').click();
    const shown = Date.now();
    const toast = page.locator('[data-toast]').filter({ hasText: '1 bouteille ouverte' });
    await expect(toast).toBeVisible();
    // The message changes place: beside the drawer, top right without it, beside it again.
    await page.waitForTimeout(1000);
    await closeDrawer(page);
    await expect(drawerOf(page)).toHaveCount(0);
    await expect(toast).toHaveAttribute('data-placement', 'top-right');
    await openFromCell(page, name, 3, 1);
    await expect(toast).toHaveAttribute('data-placement', 'bottom-right');
    await page.waitForTimeout(Math.max(0, 7000 - (Date.now() - shown)));
    await expect(toast).toBeVisible();
    await expect(toast).not.toHaveAttribute('data-toast-exiting', 'true');
    await expect(toast.getByRole('button', { name: 'Annuler' })).toBeVisible();
  });
});
