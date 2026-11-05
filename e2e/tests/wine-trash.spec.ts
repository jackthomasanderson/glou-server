import { test, expect } from '@playwright/test';

// #471 (ux-ui.md §10.4.7, D10): a wine goes to the trash with all its bottles
// only once confirmed with the total; "Annuler" brings it back, and the trash
// tab lists the wine so it can be restored from there.
test('trash a wine: confirm, undo, then restore it from the trash', async ({ page }) => {
  const api = page.request;
  const name = `E2E Trash ${Date.now()}-${Math.round(Math.random() * 1e4)}`;
  const res = await api.post('/api/inventory', { data: { category: 'wine', name, producer: 'E2E Domaine', vintage: 2020 } });
  expect(res.status(), await res.text()).toBe(201);
  const id = (await res.json()).data.id as string;

  try {
    await page.goto(`/bottles?q=${encodeURIComponent(name)}`);
    const card = page.getByTestId('family-card').filter({ hasText: name });
    await expect(card).toBeVisible();
    const confirm = page.getByRole('dialog').filter({ hasText: 'Mettre à la corbeille ?' });

    // Cancelling the confirmation changes nothing.
    await card.getByRole('button', { name: 'Mettre à la corbeille' }).click();
    await expect(confirm).toContainText(`Mettre ${name} 2020 et sa bouteille à la corbeille ?`);
    await confirm.getByRole('button', { name: 'Annuler', exact: true }).click();
    await expect(confirm).toBeHidden();
    await expect(card).toBeVisible();

    // Confirmed: the wine leaves the list; the message names it and can undo.
    await card.getByRole('button', { name: 'Mettre à la corbeille' }).click();
    await confirm.getByRole('button', { name: 'Mettre à la corbeille' }).click();
    await expect(card).toHaveCount(0);
    const toast = page.getByRole('status').filter({ hasText: `${name} 2020 mis à la corbeille` });
    await expect(toast).toBeVisible();
    await toast.getByRole('button', { name: 'Annuler' }).click();
    await expect(card).toBeVisible();

    // Trashed again, then restored from the trash tab, where it is listed once.
    await card.getByRole('button', { name: 'Mettre à la corbeille' }).click();
    await confirm.getByRole('button', { name: 'Mettre à la corbeille' }).click();
    await expect(card).toHaveCount(0);
    await page.getByRole('tab', { name: 'Corbeille' }).click();
    const trashed = page.getByTestId('trash-wines').getByRole('listitem').filter({ hasText: name });
    await expect(trashed).toContainText('avec 1 bouteille');
    await expect(page.getByRole('listitem').filter({ hasText: name })).toHaveCount(1);
    await trashed.getByRole('button', { name: 'Restaurer' }).click();
    await expect(trashed).toHaveCount(0);
    await page.getByRole('tab', { name: 'Inventaire' }).click();
    await expect(card).toBeVisible();
  } finally {
    // The wine itself too, not only its bottle (D10).
    const productId = (await (await api.get(`/api/inventory/${id}`)).json().catch(() => null))?.data?.productId as string | undefined;
    if (productId) await api.delete(`/api/products/${productId}`).catch(() => {});
    await api.delete(`/api/inventory/${id}`).catch(() => {});
  }
});
