import { test, expect, type APIRequestContext } from '@playwright/test';
import { collectPageProblems } from './_helpers';

/**
 * #705: in list view, selection mode showed no checkbox and a click on a row
 * selected nothing. And Select → tick a bottle → Bulk actions → tick "Tags" →
 * Cancel → leave selection mode replaced the page with "Une erreur est
 * survenue". Desktop only: phones always show cards.
 */

async function createItem(api: APIRequestContext, data: Record<string, unknown>): Promise<string> {
  const res = await api.post('/api/inventory', { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data.id as string;
}

test('bottles can be selected in list view, and a cancelled bulk action does not crash the page', async ({ page }, testInfo) => {
  const problems = collectPageProblems(page, testInfo);
  const api = page.request;
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e4)}`;
  const nameA = `E2E Bulk ${stamp} Alpha`;
  const nameB = `E2E Bulk ${stamp} Beta`;
  const idA = await createItem(api, { category: 'wine', name: nameA, producer: 'E2E Domaine', tags: ['e2e-705'] });
  const idB = await createItem(api, { category: 'wine', name: nameB, producer: 'E2E Domaine' });

  try {
    // Only this test's two bottles.
    await page.goto(`/bottles?q=${encodeURIComponent(stamp)}`);
    await page.getByRole('button', { name: 'Vue en liste' }).click();
    const rowA = page.getByRole('row').filter({ hasText: nameA });
    const rowB = page.getByRole('row').filter({ hasText: nameB });
    await expect(rowA).toBeVisible();
    await expect(rowB).toBeVisible();
    await expect(page.getByRole('grid').getByRole('checkbox')).toHaveCount(0);

    // Selection mode: every row gets a checkbox, a click on a row ticks it.
    await page.getByRole('button', { name: 'Sélectionner', exact: true }).click();
    await expect(rowA.getByRole('checkbox')).toHaveCount(1);
    await expect(rowB.getByRole('checkbox')).toHaveCount(1);
    await expect(rowA.getByRole('checkbox')).not.toBeChecked();

    await rowA.getByText(nameA).click();
    await expect(rowA.getByRole('checkbox')).toBeChecked();
    await expect(page.getByText('1 sélectionné', { exact: true })).toBeVisible();
    await rowB.getByText(nameB).click();
    await expect(rowB.getByRole('checkbox')).toBeChecked();
    await expect(page.getByText('2 sélectionnés', { exact: true })).toBeVisible();
    // A click on a ticked row unticks it, without opening the bottle.
    await rowB.getByText(nameB).click();
    await expect(rowB.getByRole('checkbox')).not.toBeChecked();
    await expect(page.getByText('1 sélectionné', { exact: true })).toBeVisible();
    await expect(page.locator('#inventory-detail-title')).toHaveCount(0);
    await rowB.getByText(nameB).click();
    await expect(page.getByText('2 sélectionnés', { exact: true })).toBeVisible();

    // The same selection as the card view.
    await page.getByRole('button', { name: 'Vue en cartes' }).click();
    const cardBoxes = page.getByRole('checkbox', { name: 'Sélectionner' });
    await expect(cardBoxes).toHaveCount(2);
    await expect(cardBoxes.nth(0)).toBeChecked();
    await expect(cardBoxes.nth(1)).toBeChecked();
    await page.getByRole('button', { name: 'Vue en liste' }).click();
    await expect(rowA.getByRole('checkbox')).toBeChecked();
    await expect(rowB.getByRole('checkbox')).toBeChecked();

    // Bulk actions → tick "Tags" → Cancel.
    await page.getByRole('button', { name: 'Actions groupées', exact: true }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Champs à modifier' });
    await expect(dialog).toBeVisible();
    // HeroUI's checkbox input is a transparent layer over its whole label:
    // tick the input itself, a click on the label text counts as covered.
    const tags = dialog.getByRole('checkbox', { name: 'Étiquettes' });
    await tags.check();
    await expect(tags).toBeChecked();
    await expect(dialog.getByText('Récapitulatif des changements')).toBeVisible();
    await dialog.getByRole('button', { name: 'Annuler', exact: true }).click();
    await expect(dialog).toBeHidden();

    // Leave selection mode: the page stays up.
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sélectionner', exact: true })).toBeVisible();
    await expect(page.getByText('Une erreur est survenue')).toHaveCount(0);
    await expect(rowA).toBeVisible();
    await expect(page.getByRole('grid').getByRole('checkbox')).toHaveCount(0);

    // Reopening the bulk actions starts blank.
    await page.getByRole('button', { name: 'Sélectionner', exact: true }).click();
    await rowA.getByText(nameA).click();
    await page.getByRole('button', { name: 'Actions groupées', exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('checkbox', { name: 'Étiquettes' })).not.toBeChecked();

    await problems.dump();
    expect(problems.get(), problems.get().join('\n')).toEqual([]);
  } finally {
    await api.delete(`/api/inventory/${idA}`).catch(() => {});
    await api.delete(`/api/inventory/${idB}`).catch(() => {});
  }
});
