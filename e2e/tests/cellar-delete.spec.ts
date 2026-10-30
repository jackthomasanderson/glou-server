import { test, expect } from '@playwright/test';

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
