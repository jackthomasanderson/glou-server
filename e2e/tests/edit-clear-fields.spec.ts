import { test, expect } from '@playwright/test';

/**
 * #726: emptying a field of an existing bottle saved without error and
 * changed nothing. The form held `undefined`, which the PATCH's JSON drops,
 * so the server kept the old vintage, price or colour. An emptied reminder
 * date was sent as '' and refused, so the save failed outright.
 */
test('emptying the vintage, price, colour and dates of a bottle clears them', async ({ page }) => {
  const api = page.request;
  const name = `E2E #726 ${Date.now()}`;
  const created = await api.post('/api/inventory', {
    data: {
      category: 'wine', name, producer: 'E2E Domaine',
      vintage: 2015, purchasePrice: 20, color: 'red',
      // Opened (not finished): the opening and reminder dates only show then.
      isOpened: true, fillLevel: 50, openedAt: '2026-01-10', reminderDate: '2027-01-15',
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const id = (await created.json()).data.id as string;

  try {
    // Open the bottle from the global search, then edit it.
    await page.goto('/cellars');
    const search = page.getByRole('combobox').filter({ visible: true }).first();
    await search.fill(name);
    await expect(page.getByRole('option', { name: new RegExp(name) }).first()).toBeVisible();
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect(page.locator('#inventory-detail-title')).toHaveText(name);
    // The detail window's own button: the cards behind have "Modifier" ones too.
    const detail = page.getByRole('dialog').filter({ has: page.locator('#inventory-detail-title') });
    await detail.getByRole('button', { name: 'Modifier', exact: true }).click();

    // The form window: the detail one may still be closing.
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
    await dialog.getByLabel("Prix d'achat (€)").fill('');
    const opened = dialog.getByLabel('Ouverte le');
    const reminder = dialog.getByLabel('Rappel de consommation');
    await expect(reminder).toHaveValue('2027-01-15');
    await opened.fill('');
    await reminder.fill('');

    const saved = page.waitForResponse(
      (r) => r.url().endsWith(`/api/inventory/${id}`) && r.request().method() === 'PATCH',
    );
    await dialog.getByTestId('inventory-form-submit').click();
    const res = await saved;
    expect(res.status(), await res.text()).toBe(200);
    await expect(dialog).toBeHidden();

    const item = (await (await api.get(`/api/inventory/${id}`)).json()).data as Record<string, unknown>;
    expect(item.vintage).toBeNull();
    expect(item.purchasePrice).toBeNull();
    expect(item.color).toBeNull();
    expect(item.reminderDate).toBeNull();
    expect(item.openedAt).toBeNull();
    // Untouched fields stay.
    expect(item.name).toBe(name);
  } finally {
    await api.delete(`/api/inventory/${id}`).catch(() => {});
  }
});
