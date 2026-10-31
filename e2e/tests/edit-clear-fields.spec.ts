import { test, expect } from '@playwright/test';

/**
 * #726: emptying a field of an existing bottle saved without error and
 * changed nothing. The form held `undefined`, which the PATCH's JSON drops,
 * so the server kept the old vintage, price or colour. An emptied reminder
 * date was sent as '' and refused, so the save failed outright.
 *
 * #471: "Modifier" in the drawer edits the wine's description (vintage,
 * colour, reminder); a bottle's own fields (price, opening date) are edited
 * from its line (lot W3).
 */
test('emptying the vintage, colour and reminder date of a wine clears them', async ({ page }) => {
  const api = page.request;
  const name = `E2E #726 ${Date.now()}`;
  const created = await api.post('/api/inventory', {
    data: {
      category: 'wine', name, producer: 'E2E Domaine',
      vintage: 2015, purchasePrice: 20, color: 'red', reminderDate: '2027-01-15',
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { id, productId } = (await created.json()).data as { id: string; productId: string };

  try {
    // Open the wine from the global search, then edit it.
    await page.goto('/cellars');
    const search = page.getByRole('combobox').filter({ visible: true }).first();
    await search.fill(name);
    await expect(page.getByRole('option', { name: new RegExp(name) }).first()).toBeVisible();
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect(page.locator('#inventory-detail-title')).toHaveText(name);
    // The drawer's own button: the cards behind have "Modifier" ones too.
    const detail = page.getByRole('dialog').filter({ has: page.locator('#inventory-detail-title') });
    await detail.getByRole('button', { name: 'Modifier', exact: true }).click();

    // The form window: the drawer may still be closing.
    const dialog = page.getByRole('dialog').filter({ has: page.getByTestId('inventory-form-submit') });
    const vintage = dialog.getByTestId('inventory-vintage-input');
    await expect(vintage).toHaveValue('2015');
    await vintage.fill('');

    // Colour back to "—", from the keyboard. A click lands while the window
    // is still animating in: Playwright then retries by force-scrolling the
    // trigger into view, and the list the click opens closes on that scroll
    // (an open Select closes when its form scrolls), so the option never shows.
    const colour = dialog.locator('button[data-slot="trigger"]', { hasText: 'Couleur' });
    await expect(colour).toContainText('Rouge');
    await colour.press('Enter');
    // By CSS: the open list is drawn but absent from the accessibility tree
    // inside the form window, so getByRole never finds its options.
    const options = page.locator('[role="option"]');
    await expect(options.filter({ hasText: 'Rouge' })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(options.filter({ hasText: '—' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(options).toHaveCount(0);
    await expect(colour).not.toContainText('Rouge');

    await dialog.getByRole('button', { name: 'Afficher les compléments' }).click();
    const reminder = dialog.getByLabel('Rappel de consommation');
    await expect(reminder).toHaveValue('2027-01-15');
    await reminder.fill('');

    const saved = page.waitForResponse(
      (r) => r.url().endsWith(`/api/products/${productId}`) && r.request().method() === 'PATCH',
    );
    await dialog.getByTestId('inventory-form-submit').click();
    const res = await saved;
    expect(res.status(), await res.text()).toBe(200);
    await expect(dialog).toBeHidden();

    const wine = (await (await api.get(`/api/products/${productId}`)).json()).data as Record<string, unknown>;
    expect(wine.vintage).toBeNull();
    expect(wine.color).toBeNull();
    expect(wine.reminderDate).toBeNull();
    // Untouched fields stay, and the bottle's own price was not sent.
    expect(wine.name).toBe(name);
    const item = (await (await api.get(`/api/inventory/${id}`)).json()).data as Record<string, unknown>;
    expect(Number(item.purchasePrice)).toBe(20);
    expect(item.vintage).toBeNull();
  } finally {
    await api.delete(`/api/products/${productId}`).catch(() => {});
  }
});
