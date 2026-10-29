import { test, expect } from '@playwright/test';

/**
 * #706: the bottle form rewrote what the user typed. "24.05" became "245"
 * (a 0 right after the decimal separator could not be typed), "Pinot Noir,
 * Gamay" lost its spaces and commas, the selected "Aucune cave" showed a
 * blank field, and a peak window ending before it starts was saved as is.
 *
 * Typed key by key (`pressSequentially`), since the bug lived in the
 * re-render after each keystroke, which a single `fill` skips.
 */
test('the bottle form keeps what is typed and refuses a reversed peak window', async ({ page }) => {
  const name = `E2E #706 ${Date.now()}`;
  let id: string | undefined;

  try {
    await page.goto('/bottles');
    await page.getByTestId('inventory-add-button').click();
    const dialog = page.getByRole('dialog');

    await dialog.getByTestId('inventory-name-input').fill(name);
    await dialog.getByTestId('inventory-producer-input').fill('E2E Domaine');

    // The default cellar choice is shown in the trigger, not a blank field
    // (the hidden native <option> always held the text, hence the slot).
    await expect(dialog.locator('[data-slot="value"]', { hasText: 'Aucune cave' })).toBeVisible();

    // Peak window 2035 → 2028: refused inline once the field is left.
    const peakFrom = dialog.getByLabel('Début', { exact: true });
    const peakTo = dialog.getByLabel('Fin', { exact: true });
    await peakFrom.pressSequentially('2035');
    await peakTo.pressSequentially('2028');
    await peakTo.blur();
    const peakError = dialog.getByText("La fin de l'apogée ne peut pas précéder son début");
    await expect(peakError).toBeVisible();

    await dialog.getByRole('button', { name: 'Afficher les compléments' }).click();

    const price = dialog.getByLabel("Prix d'achat (€)");
    await price.pressSequentially('24.05');
    await expect(price).toHaveValue('24.05');

    const grapes = dialog.getByLabel('Cépages');
    await grapes.pressSequentially('Pinot Noir, Gamay');
    await expect(grapes).toHaveValue('Pinot Noir, Gamay');

    // Saving with the reversed window sends nothing.
    let posted = false;
    page.on('request', (r) => {
      if (r.method() === 'POST' && /\/api\/inventory\/?$/.test(r.url())) posted = true;
    });
    await dialog.getByTestId('inventory-form-submit').click();
    await expect(peakError).toBeVisible();
    expect(posted).toBe(false);

    await peakTo.fill('2040');
    await expect(peakError).toBeHidden();

    const created = page.waitForResponse(
      (r) => /\/api\/inventory\/?$/.test(r.url()) && r.request().method() === 'POST',
    );
    await dialog.getByTestId('inventory-form-submit').click();
    const res = await created;
    expect(res.status(), await res.text()).toBe(201);
    const item = (await res.json()).data as {
      id: string;
      purchasePrice: number | string;
      grapeVarieties: string[];
      cellarId: string | null;
      peakMaturityFrom: number;
      peakMaturityTo: number;
    };
    id = item.id;
    expect(Number(item.purchasePrice)).toBe(24.05);
    expect(item.grapeVarieties).toEqual(['Pinot Noir', 'Gamay']);
    expect(item.cellarId).toBeNull();
    expect([item.peakMaturityFrom, item.peakMaturityTo]).toEqual([2035, 2040]);
  } finally {
    if (id) await page.request.delete(`/api/inventory/${id}`);
  }
});

// The API refuses it too, for any client (#706).
test('the API refuses a peak window that ends before it starts', async ({ page }) => {
  const api = page.request;
  const res = await api.post('/api/inventory', {
    data: { category: 'wine', name: `E2E #706 API ${Date.now()}`, producer: 'E2E Domaine', peakMaturityFrom: 2035, peakMaturityTo: 2028 },
  });
  expect(res.status(), await res.text()).toBe(400);

  const ok = await api.post('/api/inventory', {
    data: { category: 'wine', name: `E2E #706 API ${Date.now()}`, producer: 'E2E Domaine', peakMaturityFrom: 2035, peakMaturityTo: 2040 },
  });
  expect(ok.status(), await ok.text()).toBe(201);
  const id = (await ok.json()).data.id as string;
  try {
    // Moving only the end before the stored start is refused as well.
    const patch = await api.patch(`/api/inventory/${id}`, { data: { peakMaturityTo: 2030 } });
    expect(patch.status(), await patch.text()).toBe(400);
  } finally {
    await api.delete(`/api/inventory/${id}`);
  }
});
