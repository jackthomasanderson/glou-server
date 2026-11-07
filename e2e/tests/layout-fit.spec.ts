import { test, expect, type APIRequestContext, type APIResponse, type Locator, type Page } from '@playwright/test';

/**
 * Recette n°5 ter of #847 and #867, measured in a real browser: the list of
 * cigars must not scroll sideways at 1280 px and more, its stock line wraps
 * between its parts only; a long field label of the add/edit form stays on
 * one line at 375 px; a long tasting title is shown whole. Shared inventory:
 * every family created here is put in the trash.
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

type Unit = { id: string; productId: string };

async function cigar(api: APIRequestContext, name: string): Promise<Unit> {
  const boxes = await okData<Unit>(await api.post('/api/inventory', {
    data: { category: 'cigar', name, producer: 'Hoyo de Monterrey Fábrica de Tabacos', format: 'Robusto', leafOrigin: 'Cuba', cigarsPerBox: 25, quantity: 3 },
  }));
  // Single cigars too: the stock line reads "3 boîtes fermées · 4 à l'unité".
  await okData(await api.post(`/api/products/${boxes.productId}/items`, { data: { quantity: 4 } }));
  return boxes;
}

/** Labels of the open form that run over more than one line. */
async function wrappedLabels(form: Locator): Promise<string[]> {
  return form.locator('label[data-slot="label"]').evaluateAll((labels) => labels
    .filter((label) => {
      const style = getComputedStyle(label);
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
      return label.getBoundingClientRect().height > lineHeight * 1.5;
    })
    .map((label) => label.textContent ?? ''));
}

async function showOptionals(page: Page): Promise<Locator> {
  const form = page.getByRole('dialog').filter({ has: page.getByTestId('inventory-form-submit') });
  await form.getByRole('button', { name: 'Afficher les compléments' }).click();
  await expect(form.getByRole('button', { name: 'Masquer les compléments' })).toBeVisible();
  return form;
}

test.describe('Layout fits its width (recette n°5 ter of #847)', () => {
  test('the list of cigars does not scroll sideways at 1280 and 1471 px', async ({ page }) => {
    const api = page.request;
    const name = `E2E 5ter Robusto Edición Limitada Gran Reserva ${stamp()}`;
    const { productId } = await cigar(api, name);
    try {
      await page.addInitScript(() => localStorage.setItem('glou:view-mode:inventory', 'list'));
      for (const width of [1280, 1471]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/cigars');
        const row = page.getByRole('row').filter({ hasText: name });
        await expect(row).toBeVisible();
        const overflow = await page.locator('table').first().evaluate((table) => {
          const wrapper = table.parentElement as HTMLElement;
          return { table: wrapper.scrollWidth - wrapper.clientWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        });
        expect(overflow.table, `table overflow at ${width} px`).toBeLessThanOrEqual(0);
        expect(overflow.page, `page overflow at ${width} px`).toBeLessThanOrEqual(0);
        // Each part of the stock line stays whole on one line.
        const parts = row.getByTestId('family-stock-line').locator('span[aria-hidden="true"] > span');
        await expect(parts).toHaveText([/^3\s+boîtes fermées$/, /^4\s+à l'unité$/]);
        for (const lines of await parts.evaluateAll((spans) => spans.map((span) => span.getClientRects().length))) expect(lines).toBe(1);
      }
    } finally {
      await api.delete(`/api/products/${productId}`);
    }
  });

  test('no field label of the add and edit forms wraps at 375 px (#867)', async ({ page }) => {
    const api = page.request;
    const { productId } = await cigar(api, `E2E 5ter Siglo ${stamp()}`);
    try {
      await page.setViewportSize({ width: 375, height: 812 });
      // Adding a wine: alcohol degree, serving temperature, value of a bottle.
      await page.goto('/bottles');
      await page.getByTestId('inventory-add-button').click();
      const addForm = await showOptionals(page);
      await expect(addForm.getByLabel("Degré d'alcool (%)")).toBeVisible();
      expect(await wrappedLabels(addForm)).toEqual([]);
      await addForm.getByTestId('inventory-form-cancel').click();
      await expect(addForm).toBeHidden();

      // Editing a cigar: its consumption reminder.
      await page.goto(`/cigars?scan=${encodeURIComponent(productId)}`);
      const drawer = page.getByRole('dialog').filter({ has: page.locator('#inventory-detail-title') });
      await drawer.getByRole('button', { name: 'Modifier', exact: true }).click();
      const editForm = await showOptionals(page);
      await expect(editForm.getByLabel('Rappel de consommation')).toBeVisible();
      expect(await wrappedLabels(editForm)).toEqual([]);
    } finally {
      await api.delete(`/api/products/${productId}`);
    }
  });

  test('a long tasting title is shown whole in the journal', async ({ page }) => {
    const api = page.request;
    const name = `E2E 5ter Cuvée Une au nom vraiment très long ${stamp()}`;
    const producer = 'Domaine des Très Longs Noms de la Recette';
    const bottle = await okData<Unit>(await api.post('/api/inventory', { data: { category: 'wine', name, producer } }));
    try {
      await okData(await api.post('/api/tastings', { data: { productId: bottle.productId, rating: 4, notes: 'E2E 5ter' } }));
      for (const width of [375, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/cellar-journal');
        const title = page.getByTestId('tasting-card-title').filter({ hasText: name });
        await expect(title).toHaveText(`${name} — ${producer}`);
        const cut = await title.evaluate((el) => el.scrollWidth > el.clientWidth || getComputedStyle(el).textOverflow === 'ellipsis');
        expect(cut, `title cut at ${width} px`).toBe(false);
      }
    } finally {
      await api.delete(`/api/products/${bottle.productId}`);
    }
  });
});
