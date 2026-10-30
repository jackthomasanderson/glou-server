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
  const ids = [
    await createItem(api, { category: 'wine', name: `E2E Bulk ${stamp} Alpha`, producer: 'E2E Domaine', tags: ['e2e-705'] }),
    await createItem(api, { category: 'wine', name: `E2E Bulk ${stamp} Beta`, producer: 'E2E Domaine' }),
    await createItem(api, { category: 'wine', name: `E2E Bulk ${stamp} Gamma`, producer: 'E2E Domaine' }),
  ];

  try {
    // Only this test's three bottles, in whatever order the list sorts them.
    await page.goto(`/bottles?q=${encodeURIComponent(stamp)}`);
    await page.getByRole('button', { name: 'Vue en liste' }).click();
    const rows = page.getByRole('row').filter({ hasText: stamp });
    await expect(rows).toHaveCount(3);
    const [first, middle, last] = [rows.nth(0), rows.nth(1), rows.nth(2)];
    // Clicks land on the bottle's name, as a user would.
    const nameIn = (row: typeof first) => row.getByText(`E2E Bulk ${stamp}`);
    await expect(page.getByRole('grid').getByRole('checkbox')).toHaveCount(0);

    // Selection mode: every row gets a checkbox, a click on a row ticks it.
    await page.getByRole('button', { name: 'Sélectionner', exact: true }).click();
    for (const row of [first, middle, last]) await expect(row.getByRole('checkbox')).toHaveCount(1);
    await expect(first.getByRole('checkbox')).not.toBeChecked();

    await nameIn(first).click();
    await expect(first.getByRole('checkbox')).toBeChecked();
    await expect(page.getByText('1 sélectionné', { exact: true })).toBeVisible();
    // Shift-click ticks the whole range.
    await nameIn(last).click({ modifiers: ['Shift'] });
    for (const row of [first, middle, last]) await expect(row.getByRole('checkbox')).toBeChecked();
    await expect(page.getByText('3 sélectionnés', { exact: true })).toBeVisible();
    // A click on a ticked row unticks it, without opening the bottle.
    await nameIn(middle).click();
    await expect(middle.getByRole('checkbox')).not.toBeChecked();
    await expect(page.getByText('2 sélectionnés', { exact: true })).toBeVisible();
    await expect(page.locator('#inventory-detail-title')).toHaveCount(0);

    // The same selection as the card view.
    await page.getByRole('button', { name: 'Vue en cartes' }).click();
    await expect(page.getByRole('checkbox', { name: 'Sélectionner' })).toHaveCount(3);
    await expect(page.getByRole('checkbox', { name: 'Sélectionner', checked: true })).toHaveCount(2);
    await page.getByRole('button', { name: 'Vue en liste' }).click();
    await expect(first.getByRole('checkbox')).toBeChecked();
    await expect(middle.getByRole('checkbox')).not.toBeChecked();
    await expect(last.getByRole('checkbox')).toBeChecked();

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
    await expect(rows).toHaveCount(3);
    await expect(page.getByRole('grid').getByRole('checkbox')).toHaveCount(0);

    // Out of selection mode, a click on a row opens the bottle again.
    await nameIn(first).click();
    const detailTitle = page.locator('#inventory-detail-title');
    await expect(detailTitle).toBeVisible();
    await expect(detailTitle).toContainText(`E2E Bulk ${stamp}`);
    await page.keyboard.press('Escape');
    await expect(detailTitle).toBeHidden();

    // Reopening the bulk actions starts blank.
    await page.getByRole('button', { name: 'Sélectionner', exact: true }).click();
    await nameIn(first).click();
    await page.getByRole('button', { name: 'Actions groupées', exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('checkbox', { name: 'Étiquettes' })).not.toBeChecked();

    await problems.dump();
    expect(problems.get(), problems.get().join('\n')).toEqual([]);
  } finally {
    for (const id of ids) await api.delete(`/api/inventory/${id}`).catch(() => {});
  }
});
