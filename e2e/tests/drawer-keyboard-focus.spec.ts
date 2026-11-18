import { test, expect, type Page } from '@playwright/test';

/**
 * #1022: after drawers and windows had been opened and closed a few times,
 * a wine's drawer opened with Enter left the focus on the card, outside the
 * open drawer (Escape then did not even close it). react-aria moves the
 * focus into a window opened from the keyboard once no CSS transition runs;
 * a button's cancelled transition, bubbling up to its card, made it lose
 * track of the card's own hover shadow, and it waited for good.
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

test.describe('a drawer opened with Enter takes the focus, however many windows came before (#1022)', () => {
  const ids: string[] = [];
  test.afterEach(async ({ page }) => {
    for (const id of ids.splice(0)) {
      const productId = (await (await page.request.get(`/api/inventory/${id}`)).json().catch(() => null))?.data?.productId as string | undefined;
      if (productId) await page.request.delete(`/api/products/${productId}`).catch(() => {});
      await page.request.delete(`/api/inventory/${id}`).catch(() => {});
    }
  });

  const drawerOf = (page: Page) => page.getByRole('dialog').filter({ has: page.locator('#inventory-detail-title') });
  /** Whether the focus is inside the wine's drawer. */
  const focusInDrawer = (page: Page) => page.evaluate(() => {
    const drawer = document.getElementById('inventory-detail-title')?.closest('[role="dialog"]');
    return !!drawer && drawer.contains(document.activeElement);
  });

  test('open and close cycles, then Enter on a card', async ({ page }) => {
    const prefix = `E2E Focus ${stamp()}`;
    const names = ['A', 'B', 'C', 'D'].map((letter) => `${prefix} ${letter}`);
    for (const name of names) {
      const res = await page.request.post('/api/inventory', { data: { category: 'wine', name, producer: 'E2E Domaine', vintage: 2020, quantity: 2 } });
      expect(res.status(), await res.text()).toBe(201);
      ids.push((await res.json()).data.id as string);
    }
    await page.goto(`/bottles?q=${encodeURIComponent(prefix)}`);
    const cards = page.getByTestId('family-card');
    await expect(cards).toHaveCount(names.length);
    await page.waitForLoadState('networkidle');

    const card = (i: number) => cards.filter({ hasText: names[i % names.length] });
    const nameButton = (i: number) => card(i).getByRole('button', { name: new RegExp(`^${names[i % names.length]} 2020`) });
    const confirm = page.getByRole('dialog').filter({ hasText: 'Mettre à la corbeille ?' });
    const drawer = drawerOf(page);

    // Each way of closing the app's windows, with the pointer over the cards as a member's would be.
    const cycles: ((i: number) => Promise<void>)[] = [
      async (i) => { await nameButton(i).click(); await expect(drawer).toBeVisible(); await page.keyboard.press('Escape'); },
      async (i) => { await nameButton(i).click(); await expect(drawer).toBeVisible(); await drawer.getByRole('button', { name: 'Fermer' }).first().click(); },
      async (i) => { await card(i).getByRole('button', { name: 'Mettre à la corbeille' }).click(); await confirm.getByRole('button', { name: 'Annuler', exact: true }).click(); },
      async (i) => { await card(i).getByRole('button', { name: 'Mettre à la corbeille' }).click(); await expect(confirm).toBeVisible(); await page.keyboard.press('Escape'); },
    ];

    for (let round = 0; round < 12; round += 1) {
      await cycles[round % cycles.length](round);
      await expect(page.locator('[aria-modal="true"][data-open]')).toHaveCount(0);

      await nameButton(round + 1).focus();
      await page.keyboard.press('Enter');
      await expect(drawer).toBeVisible();
      await expect.poll(() => focusInDrawer(page), { message: `round ${round}: the focus moved into the drawer`, timeout: 3000 }).toBe(true);
      await drawer.getByRole('button', { name: 'Fermer' }).first().click();
      await expect(drawer).toHaveCount(0);
    }
  });
});
