import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * FEAT-37 guest shares — the security-relevant surface: a share link exposes a
 * read-only slice of the cellar to someone with no account, and nothing more.
 */

async function firstCellarId(api: APIRequestContext): Promise<string> {
  const res = await api.get('/api/cellars');
  expect(res.ok()).toBe(true);
  const body = await res.json();
  const cellars = body.data ?? body;
  expect(Array.isArray(cellars) && cellars.length, 'the test user needs at least one cellar').toBeTruthy();
  return cellars[0].id;
}

async function aBottleNameIn(api: APIRequestContext, cellarId: string): Promise<string> {
  const body = await (await api.get('/api/inventory')).json();
  const items = (body.data ?? body) as Array<{ name: string; cellarId?: string | null }>;
  const hit = items.find((i) => i.cellarId === cellarId);
  expect(hit, 'the scoped cellar should contain at least one item').toBeTruthy();
  return hit!.name;
}

test('a guest link is read-only, scoped, and dies when revoked', async ({ page, browser }) => {
  const cellarId = await firstCellarId(page.request);
  const bottleName = await aBottleNameIn(page.request, cellarId);

  const created = await page.request.post('/api/shares', {
    data: { label: `E2E guest ${Date.now()}`, cellarIds: [cellarId], collectionIds: [], hidePrices: false },
  });
  expect(created.ok()).toBe(true);
  const share = (await created.json()).data as { id: string; token: string };
  expect(share.token).toBeTruthy();

  // A brand-new context — no auth cookie, like a real recipient.
  const guestCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const guest = await guestCtx.newPage();

  try {
    const resp = await guest.goto(`/guest/${share.token}`, { waitUntil: 'networkidle' });
    expect(resp?.status()).toBe(200);

    await expect(guest.getByText(/Lecture seule/i)).toBeVisible();
    await expect(guest.getByText(bottleName, { exact: false }).first()).toBeVisible();

    // No write affordances anywhere on the guest view.
    await expect(guest.getByRole('button', { name: /Modifier|Supprimer|Ajouter|Enregistrer/i })).toHaveCount(0);

    // The guest cannot walk into the authenticated app.
    await guest.goto('/bottles', { waitUntil: 'domcontentloaded' });
    await expect(guest).toHaveURL(/\/login/);

    // Revoke it — the same link must stop serving the cellar.
    const revoked = await page.request.delete(`/api/shares/${share.id}`);
    expect(revoked.ok()).toBe(true);

    await guest.goto(`/guest/${share.token}`, { waitUntil: 'networkidle' });
    await expect(guest.getByText(bottleName, { exact: false })).toHaveCount(0);
  } finally {
    await page.request.delete(`/api/shares/${share.id}`).catch(() => {});
    await guestCtx.close();
  }
});
