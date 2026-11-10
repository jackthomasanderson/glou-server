import { test, expect, type APIResponse } from '@playwright/test';

/**
 * #580: the server deleted the cellar and answered 204 No Content, but the
 * screen read that empty answer as a failure: error message, confirmation
 * left open, cellar still listed.
 */
test('deleting a cellar closes the confirmation and removes it, without an error', async ({ page }) => {
  const api = page.request;
  const name = `E2E #580 ${Date.now()}`;
  const created = await api.post('/api/cellars', { data: { name } });
  expect(created.status(), await created.text()).toBe(201);
  const id = (await created.json()).data.id as string;

  try {
    await page.goto('/cellars');
    // The card (grid view) or row (list view) that holds this cellar's own delete button.
    const cellar = page
      .getByText(name, { exact: true })
      .locator('xpath=ancestor::*[.//button[@aria-label="Supprimer"]][1]');
    await cellar.getByRole('button', { name: 'Supprimer', exact: true }).click();

    const dialog = page.getByRole('dialog').filter({ hasText: 'Supprimer la cave' });
    const deleted = page.waitForResponse(
      (r) => r.url().endsWith(`/api/cellars/${id}`) && r.request().method() === 'DELETE',
    );
    await dialog.getByRole('button', { name: 'Supprimer', exact: true }).click();
    expect((await deleted).status()).toBe(204);

    await expect(dialog).toBeHidden();
    await expect(page.getByText('Cave supprimée')).toBeVisible();
    await expect(page.getByText('Impossible de supprimer la cave')).toHaveCount(0);
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  } finally {
    await api.delete(`/api/cellars/${id}`).catch(() => {});
  }
});

/**
 * #597, on a real PostgreSQL (API level): a count remembered its cellar by id
 * with no foreign key. Once the cellar was deleted during a paused count,
 * putting a bottle back "in the counted cellar" broke the bottles' foreign
 * key and the count could never be closed. And the guest shares kept listing
 * the deleted cellar.
 */
test('deleting the cellar of a paused count leaves a count that resumes and closes, and leaves the shares', async ({ page }) => {
  const api = page.request;
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e4)}`;
  const data = async <T>(res: APIResponse): Promise<T> => {
    expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
    return (await res.json()).data as T;
  };

  const counted = await data<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E #597 counted ${stamp}` } }));
  const other = await data<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E #597 other ${stamp}` } }));
  const bottle = await data<{ id: string; productId: string }>(await api.post('/api/inventory', {
    data: { category: 'wine', name: `E2E #597 ${stamp}`, producer: 'E2E Domaine', cellarId: other.id },
  }));
  let sessionId: string | null = null;
  const shareIds: string[] = [];

  try {
    const start = await api.post('/api/inventory-count/sessions', { data: { scopeLabel: `E2E #597 ${stamp}`, cellarId: counted.id } });
    // CI starts from an empty database and every count spec closes its own.
    expect(start.status(), await start.text()).toBe(201);
    sessionId = ((await start.json()).data as { id: string }).id;
    // Found here though it belongs to the other cellar: "put it in this cellar" is offered.
    await data(await api.post(`/api/inventory-count/sessions/${sessionId}/scan`, { data: { itemId: bottle.id } }));
    await data(await api.patch(`/api/inventory-count/sessions/${sessionId}/pause`));

    const both = await data<{ id: string }>(await api.post('/api/shares', {
      data: { label: `E2E #597 both ${stamp}`, cellarIds: [counted.id, other.id], writeCellarIds: [counted.id] },
    }));
    const onlyCounted = await data<{ id: string }>(await api.post('/api/shares', {
      data: { label: `E2E #597 only ${stamp}`, cellarIds: [counted.id] },
    }));
    shareIds.push(both.id, onlyCounted.id);

    expect((await api.delete(`/api/cellars/${counted.id}`)).status()).toBe(204);

    await data(await api.patch(`/api/inventory-count/sessions/${sessionId}/resume`));
    await data(await api.get(`/api/inventory-count/sessions/${sessionId}/report`));
    const closed = await data<{ appliedCount: number; skipped: { targetId: string; reason: string }[] }>(
      await api.post(`/api/inventory-count/sessions/${sessionId}/complete`, {
        data: { corrections: [{ action: 'move_to_scope', itemId: bottle.id }] },
      }),
    );
    sessionId = null;
    // The cellar is gone: nothing to put the bottle in, said so, and the count is closed.
    expect(closed).toMatchObject({ appliedCount: 0, skipped: [expect.objectContaining({ targetId: bottle.id, reason: 'session_has_no_cellar' })] });
    expect((await data<{ cellarId: string | null }>(await api.get(`/api/inventory/${bottle.id}`))).cellarId).toBe(other.id);

    type Share = { id: string; cellarIds: string[]; writeCellarIds: string[]; revokedAt: string | null };
    const shares = await data<Share[]>(await api.get('/api/shares'));
    expect(shares.find((s) => s.id === both.id)).toMatchObject({ cellarIds: [other.id], writeCellarIds: [], revokedAt: null });
    // Left with nothing in scope, it would have opened the whole cellar: revoked.
    expect(shares.find((s) => s.id === onlyCounted.id)).toMatchObject({ cellarIds: [], revokedAt: expect.any(String) });
  } finally {
    if (sessionId) await api.post(`/api/inventory-count/sessions/${sessionId}/complete`, { data: { corrections: [] } }).catch(() => {});
    for (const id of shareIds) await api.delete(`/api/shares/${id}`).catch(() => {});
    await api.delete(`/api/products/${bottle.productId}`).catch(() => {});
    await api.delete(`/api/cellars/${counted.id}`).catch(() => {});
    await api.delete(`/api/cellars/${other.id}`).catch(() => {});
  }
});
