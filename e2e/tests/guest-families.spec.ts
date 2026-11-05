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
      const open = async () => {
        const sent = guest.waitForResponse((r) => r.url().endsWith(`/inventory/${group.id}`) && r.request().method() === 'PATCH');
        await card.getByTestId('guest-move-open').click();
        expect((await sent).status()).toBe(200);
        await expect(card.getByTestId('guest-family-stock')).toContainText('7 pleines · 1 entamée');
      };
      await open();
      await expect(guest.getByText('Quelles bouteilles ?')).toHaveCount(0);

      // Decision 68: « Annuler » for a moment puts it back with the others.
      await expect(guest.getByText('1 bouteille ouverte')).toBeVisible();
      const undone = guest.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/inventory/'));
      await guest.locator('button', { hasText: /^Annuler$/ }).last().click();
      expect((await undone).status()).toBe(200);
      await expect(card.getByTestId('guest-family-stock')).toContainText('8 bouteilles');
      expect((await unitsOf(api, group.productId)).find((unit) => unit.id === group.id)?.quantity).toBe(6);

      await open();
      // … and so for the members: a group ×5 and an opened bottle.
      const units = await unitsOf(api, group.productId);
      expect(units.find((unit) => unit.id === group.id)?.quantity).toBe(5);
      expect(units.find((unit) => unit.id === kitchenLine.id)?.quantity).toBe(2);
      const opened = units.filter((unit) => unit.isOpened && unit.parentItemId === group.id);
      expect(opened).toHaveLength(1);

      // « Annuler » is the guest's own, just made: never from another link.
      const other = await okData<{ id: string; token: string }>(await api.post('/api/shares', {
        data: { label: `E2E O other ${stamp()}`, cellarIds: [garage], writeCellarIds: [garage], collectionIds: [] },
      }));
      shares.push(other.id);
      const foreignUndo = await guest.request.patch(`/api/guest/${other.token}/inventory/${opened[0].id}`, { data: { undo: true } });
      expect(foreignUndo.status()).toBe(403);
      expect((await foreignUndo.json()).error).toBe('GUEST_UNDO_REFUSED');

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

      // c3: a tasting on the opened bottle, signed with the guest's name.
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

    const detail = await okData<{ tastings: Array<{ guestName: string | null; rating: number | null; notes: string | null; itemId: string | null }> }>(
      await api.get(`/api/products/${group.productId}`),
    );
    const openedId = (await unitsOf(api, group.productId)).find((unit) => unit.isOpened)?.id;
    expect(detail.tastings).toEqual([expect.objectContaining({ guestName: 'Marie', rating: 4, notes: 'Superbe à l’ouverture', itemId: openedId })]);

    // The members see it on the wine, on that bottle, signed "Marie (invité)".
    await page.goto(`/bottles?scan=${encodeURIComponent(group.productId)}`);
    const drawer = page.getByRole('dialog').filter({ has: page.locator('#inventory-detail-title') });
    const tastings = drawer.getByTestId('family-tastings');
    await expect(tastings).toContainText('Marie (invité)');
    await expect(tastings).not.toContainText('Goûté ailleurs');
  });

  // Decision 70: the bottle just drunk, even the last one, takes the guest's tasting —
  // still offered once the 5-second message is gone (recette #471, lot RB).
  test('the last bottle drunk: its tasting is noted on it, still offered after the message', async ({ page, browser }) => {
    const api = page.request;
    const cellar = (await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E O Last ${stamp()}` } }))).id;
    cellars.push(cellar);
    const name = `E2E O last ${stamp()}`;
    const bottle = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'wine', name, producer: 'E2E Domaine', cellarId: cellar },
    }));
    families.push(bottle.productId);
    const share = await okData<{ id: string; token: string }>(await api.post('/api/shares', {
      data: { label: `E2E O last ${stamp()}`, inviteeName: 'Paul', cellarIds: [cellar], writeCellarIds: [cellar], collectionIds: [] },
    }));
    shares.push(share.id);

    const { context, page: guest } = await asGuest(browser, share.token);
    try {
      const card = guest.getByTestId('guest-family').filter({ hasText: name });
      await card.getByTestId('guest-move-drink').click();
      await expect(guest.getByText('1 bouteille bue')).toBeVisible();
      // Out of stock: its card leaves the showcase; once the message is gone, the page still offers its tasting.
      await expect(card).toHaveCount(0);
      await expect(guest.getByText('1 bouteille bue')).toBeHidden({ timeout: 10_000 });
      const offer = guest.getByTestId('guest-just-drunk');
      await expect(offer).toContainText(name);
      await offer.getByTestId('guest-just-drunk-tasting').click();
      const dialog = guest.getByRole('dialog');
      await dialog.getByRole('button', { name: /Note 5/ }).click();
      const noted = guest.waitForResponse((r) => r.url().endsWith('/tastings') && r.request().method() === 'POST');
      await dialog.getByRole('button', { name: 'Enregistrer' }).click();
      expect((await noted).status()).toBe(201);
      await expect(offer).toBeHidden();
    } finally {
      await context.close();
    }
    const detail = await okData<{ tastings: Array<{ guestName: string | null; itemId: string | null; rating: number | null }> }>(
      await api.get(`/api/products/${bottle.productId}`),
    );
    expect(detail.tastings).toEqual([expect.objectContaining({ guestName: 'Paul', itemId: bottle.id, rating: 5 })]);
  });

  // Recette #471 (lot RB): « J'en bois une » finishes the opened bottle, as for a member
  // (§10.4.2); its « Annuler » gives it back opened at its level — never closed (decision 69).
  test('« J\'en bois une » finishes the opened bottle, « Annuler » gives it back at its level', async ({ page, browser }) => {
    const api = page.request;
    const cellar = (await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E RB Opened ${stamp()}` } }))).id;
    cellars.push(cellar);
    const name = `E2E RB opened ${stamp()}`;
    const bottle = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'wine', name, producer: 'E2E Domaine', cellarId: cellar },
    }));
    families.push(bottle.productId);
    await okData(await api.patch(`/api/inventory/${bottle.id}`, { data: { isOpened: true, fillLevel: 40, openedAt: new Date().toISOString() } }));
    const share = await okData<{ id: string; token: string }>(await api.post('/api/shares', {
      data: { label: `E2E RB opened ${stamp()}`, cellarIds: [cellar], writeCellarIds: [cellar], collectionIds: [] },
    }));
    shares.push(share.id);

    const { context, page: guest } = await asGuest(browser, share.token);
    try {
      const card = guest.getByTestId('guest-family').filter({ hasText: name });
      // Only the opened bottle is left: no « J'en ouvre une », no « Pleine ».
      await expect(card.getByTestId('guest-move-open')).toHaveCount(0);
      await expect(card.getByRole('button', { name: 'Pleine' })).toHaveCount(0);
      const sent = guest.waitForResponse((r) => r.url().endsWith(`/inventory/${bottle.id}`) && r.request().method() === 'PATCH');
      await card.getByTestId('guest-move-drink').click();
      const finished = await sent;
      expect(finished.status()).toBe(200);
      expect((await finished.json()).data).toMatchObject({ id: bottle.id, isOpened: true, fillLevel: 0 });
      await expect(card).toHaveCount(0);

      const undone = guest.waitForResponse((r) => r.url().endsWith(`/inventory/${bottle.id}`) && r.request().method() === 'PATCH');
      await guest.locator('button', { hasText: /^Annuler$/ }).last().click();
      expect((await undone).status()).toBe(200);
      await expect(guest.getByTestId('guest-family').filter({ hasText: name })).toHaveCount(1);
      await expect(guest.getByTestId('guest-just-drunk')).toHaveCount(0);
    } finally {
      await context.close();
    }
    expect((await unitsOf(api, bottle.productId))[0]).toMatchObject({ id: bottle.id, isOpened: true, fillLevel: 40 });
  });

  // Review of #820: two « Annuler » in either order end as one line ×2.
  for (const order of ['first move first', 'last move first'] as const) {
    test(`two bottles of a ×2 drunk, both undone (${order}): one line ×2`, async ({ page, browser }) => {
      const api = page.request;
      const cellar = (await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E O Undo ${stamp()}` } }))).id;
      cellars.push(cellar);
      const group = await okData<Unit>(await api.post('/api/inventory', {
        data: { category: 'wine', name: `E2E O undo ${stamp()}`, producer: 'E2E Domaine', quantity: 2, cellarId: cellar },
      }));
      families.push(group.productId);
      const share = await okData<{ id: string; token: string }>(await api.post('/api/shares', {
        data: { label: `E2E O undo ${stamp()}`, cellarIds: [cellar], writeCellarIds: [cellar], collectionIds: [] },
      }));
      shares.push(share.id);

      const { context, page: guest } = await asGuest(browser, share.token);
      try {
        const patch = async (id: string, data: Record<string, unknown>) =>
          okData<{ id: string }>(await guest.request.patch(`/api/guest/${share.token}/inventory/${id}`, { data }));
        const first = await patch(group.id, { isOpened: true, fillLevel: 0 }); // detached from the ×2
        const second = await patch(group.id, { isOpened: true, fillLevel: 0 }); // the line of one, finished in place
        expect(first.id).not.toBe(group.id);
        expect(second.id).toBe(group.id);
        for (const id of order === 'first move first' ? [first.id, second.id] : [second.id, first.id]) await patch(id, { undo: true });
      } finally {
        await context.close();
      }
      const units = await unitsOf(api, group.productId);
      expect(units.map((unit) => [unit.quantity, unit.isOpened])).toEqual([[2, false]]);
    });
  }

  // Review of #820: « Annuler » after the bottle's grid slot was taken: it comes back, without a slot.
  test('« Annuler » of a bottle drunk in place whose slot was taken meanwhile: back in stock, unplaced', async ({ page, browser }) => {
    const api = page.request;
    const cellar = (await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E O Slot ${stamp()}`, columns: 3, rows: 3 } }))).id;
    cellars.push(cellar);
    const bottle = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'wine', name: `E2E O slot ${stamp()}`, producer: 'E2E Domaine', cellarId: cellar },
    }));
    families.push(bottle.productId);
    await okData(await api.patch(`/api/inventory/${bottle.id}`, { data: { slotColumn: 2, slotRow: 3 } }));
    const share = await okData<{ id: string; token: string }>(await api.post('/api/shares', {
      data: { label: `E2E O slot ${stamp()}`, cellarIds: [cellar], writeCellarIds: [cellar], collectionIds: [] },
    }));
    shares.push(share.id);

    const { context, page: guest } = await asGuest(browser, share.token);
    try {
      const url = `/api/guest/${share.token}/inventory/${bottle.id}`;
      expect((await guest.request.patch(url, { data: { isOpened: true, fillLevel: 0 } })).status()).toBe(200);
      // A member puts another bottle in the slot it gave back.
      const other = await okData<Unit>(await api.post('/api/inventory', {
        data: { category: 'wine', name: `E2E O other ${stamp()}`, producer: 'E2E Domaine', cellarId: cellar },
      }));
      families.push(other.productId);
      await okData(await api.patch(`/api/inventory/${other.id}`, { data: { slotColumn: 2, slotRow: 3 } }));

      expect((await guest.request.patch(url, { data: { undo: true } })).status()).toBe(200);
    } finally {
      await context.close();
    }
    const [back] = await unitsOf(api, bottle.productId);
    expect(back).toMatchObject({ id: bottle.id, isOpened: false, slotColumn: null, slotRow: null });
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
