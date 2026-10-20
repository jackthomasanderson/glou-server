import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * #492: every defect AUDIT_004 found sat in a journey no test exercised.
 * One spec per fixed journey, at the API level when that is where the bug
 * lived, in the browser when it was a cross-screen flow.
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

async function firstCellarId(api: APIRequestContext): Promise<string> {
  const body = await (await api.get('/api/cellars')).json();
  const cellars = (body.data ?? body) as Array<{ id: string }>;
  expect(cellars.length, 'the test user needs at least one cellar').toBeGreaterThan(0);
  return cellars[0].id;
}

async function createItem(api: APIRequestContext, data: Record<string, unknown>): Promise<string> {
  const res = await api.post('/api/inventory', { data });
  expect(res.ok(), await res.text()).toBe(true);
  const id = (await res.json())?.data?.id as string | undefined;
  expect(id).toBeTruthy();
  return id!;
}

// #472 + #483: a guest with write access on a share that hides notes and
// prices must neither erase the owner's notes nor read them (or the price)
// back in the response to their own edit.
test('a write-enabled guest cannot erase or read hidden notes and prices', async ({ page, browser }) => {
  const api = page.request;
  const cellarId = await firstCellarId(api);
  const itemId = await createItem(api, {
    category: 'wine', name: `E2E Guest Notes ${stamp()}`, producer: 'E2E Domaine',
    cellarId, notes: 'Owner secret', purchasePrice: 42,
  });
  const created = await api.post('/api/shares', {
    data: {
      label: `E2E write ${stamp()}`, cellarIds: [cellarId], writeCellarIds: [cellarId],
      collectionIds: [], hidePrices: true, hideNotes: true,
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const share = (await created.json()).data as { id: string; token: string };

  const guestCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const patch = await guestCtx.request.patch(`/api/guest/${share.token}/inventory/${itemId}`, {
      data: { isOpened: true, fillLevel: 50, notes: null },
    });
    expect(patch.ok(), await patch.text()).toBe(true);
    const visible = (await patch.json()).data as Record<string, unknown>;
    expect(visible.notes).toBeUndefined();
    expect(visible.purchasePrice).toBeUndefined();
    expect(visible.estimatedValue).toBeUndefined();

    const owner = (await (await api.get(`/api/inventory/${itemId}`)).json()).data as Record<string, unknown>;
    expect(owner.notes).toBe('Owner secret');
    expect(owner.fillLevel).toBe(50);
  } finally {
    await guestCtx.close();
    await api.delete(`/api/shares/${share.id}`).catch(() => {});
    await api.delete(`/api/inventory/${itemId}`).catch(() => {});
  }
});

// #470: a category link coming from another page must land on a filtered
// list, not on everything.
test('a category link opens an already filtered list', async ({ page }) => {
  const api = page.request;
  const id = stamp();
  const spiritName = `E2E Spirit ${id}`;
  const wineName = `E2E Wine ${id}`;
  const spiritId = await createItem(api, { category: 'spirit', name: spiritName, producer: 'E2E Distillery', alcoholDegree: 40 });
  const wineId = await createItem(api, { category: 'wine', name: wineName, producer: 'E2E Domaine' });
  try {
    await page.goto('/bottles?category=spirit');
    await expect(page.getByText(spiritName).first()).toBeVisible();
    await expect(page.getByText(wineName)).toHaveCount(0);
  } finally {
    await api.delete(`/api/inventory/${spiritId}`).catch(() => {});
    await api.delete(`/api/inventory/${wineId}`).catch(() => {});
  }
});

// #473: choosing an item in the global search opens that item, not a list.
test('global search opens the chosen item', async ({ page }) => {
  const api = page.request;
  const name = `E2E Search ${stamp()}`;
  const itemId = await createItem(api, { category: 'wine', name, producer: 'E2E Domaine' });
  try {
    await page.goto('/cellars');
    const search = page.getByRole('combobox').filter({ visible: true }).first();
    await search.fill(name);
    await expect(page.getByRole('option', { name: new RegExp(name) }).first()).toBeVisible();
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect(page).toHaveURL(/\/bottles/);
    await expect(page.locator('#inventory-detail-title')).toHaveText(name);
  } finally {
    await api.delete(`/api/inventory/${itemId}`).catch(() => {});
  }
});
