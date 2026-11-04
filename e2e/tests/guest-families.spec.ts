import { test, expect, type APIRequestContext, type APIResponse, type Browser } from '@playwright/test';

/**
 * #471 (lot O, FEAT-109, ux-ui.md §10.9): a guest on a cellar shared with
 * write access opens, drinks or smokes ONE copy (c1) and notes a tasting on
 * the wine (c3) — never anything that changes a number (c2); read-only, no
 * stock action at all (c4).
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

type Unit = {
  id: string; productId: string; cellarId: string | null; quantity: number | null;
  isOpened: boolean; fillLevel: number | null; parentItemId: string | null; deletedAt: string | null;
};

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

async function unitsOf(api: APIRequestContext, productId: string): Promise<Unit[]> {
  const detail = await okData<{ items: Unit[] }>(await api.get(`/api/products/${productId}`));
  return detail.items.filter((unit) => unit.deletedAt == null);
}

/** A brand-new context — no auth cookie, like a real recipient. */
async function asGuest(browser: Browser, token: string) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto(`/guest/${token}`, { waitUntil: 'networkidle' });
  return { context, page };
}

test.describe('guests: one copy at a time (#471, FEAT-109)', () => {
  const families: string[] = [];
  const cellars: string[] = [];
  const shares: string[] = [];
  test.afterEach(async ({ page }) => {
    const api = page.request;
    for (const id of shares.splice(0)) await api.delete(`/api/shares/${id}`).catch(() => {});
    for (const id of families.splice(0)) await api.delete(`/api/products/${id}`).catch(() => {});
    for (const id of cellars.splice(0)) await api.delete(`/api/cellars/${id}`).catch(() => {});
  });

  test('write access: opens one of a ×6 (c1), notes a tasting (c3), and can change no number (c2)', async ({ page, browser }) => {
    const api = page.request;
    const garage = (await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E O Garage ${stamp()}` } }))).id;
    const kitchen = (await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E O Cuisine ${stamp()}` } }))).id;
    cellars.push(garage, kitchen);
    const name = `E2E O guest ${stamp()}`;
    const group = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'wine', name, producer: 'E2E Domaine', purchasePrice: 20, quantity: 6, cellarId: garage },
    }));
    families.push(group.productId);
    // A line of the same wine in a cellar shared read-only: never the one taken.
    const kitchenLine = await okData<Unit>(await api.post(`/api/products/${group.productId}/items`, {
      data: { quantity: 2, purchasePrice: 20, cellarId: kitchen, purchasedAt: '2020-01-15' },
    }));

    const share = await okData<{ id: string; token: string }>(await api.post('/api/shares', {
      data: { label: `E2E O ${stamp()}`, inviteeName: 'Marie', cellarIds: [garage, kitchen], writeCellarIds: [garage], collectionIds: [] },
    }));
    shares.push(share.id);

    const { context, page: guest } = await asGuest(browser, share.token);
    try {
      const card = guest.getByTestId('guest-family').filter({ hasText: name });
      await expect(card.getByTestId('guest-family-stock')).toContainText('8 bouteilles');

      // c2: no action on a number, a move, a price, an addition nor the notes.
      await expect(card.getByRole('button', { name: /Corriger|Déplacer|prix|Ajouter|Modifier|corbeille/i })).toHaveCount(0);

      // c1: one bottle of the garage line, at once (the kitchen line is not offered).
      const sent = guest.waitForResponse((r) => r.url().endsWith(`/inventory/${group.id}`) && r.request().method() === 'PATCH');
      await card.getByTestId('guest-move-open').click();
      expect((await sent).status()).toBe(200);
      await expect(guest.getByText('Quelles bouteilles ?')).toHaveCount(0);
      await expect(card.getByTestId('guest-family-stock')).toContainText('7 pleines · 1 entamée');

      // … and so for the members: a group ×5 and an opened bottle.
      const units = await unitsOf(api, group.productId);
      expect(units.find((unit) => unit.id === group.id)?.quantity).toBe(5);
      expect(units.find((unit) => unit.id === kitchenLine.id)?.quantity).toBe(2);
      const opened = units.filter((unit) => unit.isOpened && unit.parentItemId === group.id);
      expect(opened).toHaveLength(1);

      // c2 by other means: a number, a bottle put back, the read-only line.
      const guestApi = guest.request;
      const patch = (id: string, data: Record<string, unknown>) => guestApi.patch(`/api/guest/${share.token}/inventory/${id}`, { data });
      expect((await patch(group.id, { quantity: 9 })).status()).toBe(400);
      expect((await patch(opened[0].id, { isOpened: false, fillLevel: 100 })).status()).toBe(403);
      expect((await patch(group.id, { isOpened: true, fillLevel: 60 })).status()).toBe(400);
      expect((await patch(kitchenLine.id, { isOpened: true, fillLevel: 0 })).status()).toBe(403);
      const after = await unitsOf(api, group.productId);
      expect(after.map((unit) => [unit.id, unit.quantity, unit.isOpened]).sort())
        .toEqual(units.map((unit) => [unit.id, unit.quantity, unit.isOpened]).sort());

      // c3: a tasting on the wine, signed with the guest's name.
      await card.getByTestId('guest-tasting').click();
      const dialog = guest.getByRole('dialog');
      await dialog.getByRole('button', { name: /Note 4/ }).click();
      await dialog.getByLabel('Notes de dégustation').fill('Superbe à l’ouverture');
      const noted = guest.waitForResponse((r) => r.url().endsWith('/tastings') && r.request().method() === 'POST');
      await dialog.getByRole('button', { name: 'Enregistrer' }).click();
      expect((await noted).status()).toBe(201);
      await expect(dialog).toBeHidden();
    } finally {
      await context.close();
    }

    const detail = await okData<{ tastings: Array<{ guestName: string | null; rating: number | null; notes: string | null }> }>(
      await api.get(`/api/products/${group.productId}`),
    );
    expect(detail.tastings).toEqual([expect.objectContaining({ guestName: 'Marie', rating: 4, notes: 'Superbe à l’ouverture' })]);

    // The members see it on the wine, signed "Marie (invité)".
    await page.goto(`/bottles?scan=${encodeURIComponent(group.productId)}`);
    const drawer = page.getByRole('dialog').filter({ has: page.locator('#inventory-detail-title') });
    await expect(drawer.getByTestId('family-tastings')).toContainText('Marie (invité)');
  });

  test('read-only (c4): neither open, drink nor note a tasting', async ({ page, browser }) => {
    const api = page.request;
    const cellar = (await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E O Lecture ${stamp()}` } }))).id;
    cellars.push(cellar);
    const name = `E2E O read ${stamp()}`;
    const group = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'wine', name, producer: 'E2E Domaine', quantity: 3, cellarId: cellar },
    }));
    families.push(group.productId);
    const share = await okData<{ id: string; token: string }>(await api.post('/api/shares', {
      data: { label: `E2E O read ${stamp()}`, cellarIds: [cellar], collectionIds: [] },
    }));
    shares.push(share.id);

    const { context, page: guest } = await asGuest(browser, share.token);
    try {
      const card = guest.getByTestId('guest-family').filter({ hasText: name });
      await expect(card.getByTestId('guest-family-stock')).toContainText('3 bouteilles');
      await expect(card.getByRole('button')).toHaveCount(0);

      const opened = await guest.request.patch(`/api/guest/${share.token}/inventory/${group.id}`, { data: { isOpened: true, fillLevel: 0 } });
      expect(opened.status()).toBe(403);
      const noted = await guest.request.post(`/api/guest/${share.token}/tastings`, { data: { productId: group.productId, rating: 3 } });
      expect(noted.status()).toBe(403);
    } finally {
      await context.close();
    }
    expect((await unitsOf(api, group.productId)).map((unit) => [unit.quantity, unit.isOpened])).toEqual([[3, false]]);
    expect((await okData<{ tastings: unknown[] }>(await api.get(`/api/products/${group.productId}`))).tastings).toEqual([]);
  });
});
