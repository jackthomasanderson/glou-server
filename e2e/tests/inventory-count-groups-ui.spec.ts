import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * #471 (FEAT-100 c1-c4), the screens: a group is counted in one answer
 * ("Combien en avez-vous trouvé ?"), the report proposes the corrections of
 * its missing copies with their reason and the addition of its surplus, and a
 * find of 6 bottles becomes a group ×6. The data is set up and read back
 * through the API; only the count itself goes through the screens. One count
 * session at a time instance-wide: the test always closes its own.
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

type Unit = { id: string; productId: string; quantity: number | null; writtenOffAt: string | null; isOpened: boolean };

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

/** A group of `count` bottles at 20 € in `cellarId`. */
async function group(api: APIRequestContext, cellarId: string, name: string, count: number): Promise<Unit> {
  const first = await okData<Unit>(await api.post('/api/inventory', {
    data: { category: 'wine', name, producer: 'E2E Domaine', cellarId, purchasePrice: 20 },
  }));
  await okData(await api.post(`/api/products/${first.productId}/items`, { data: { quantity: count - 1, cellarId, purchasePrice: 20 } }));
  return first;
}

const families: string[] = [];
let cellarId = '';
let sessionId: string | null = null;

// In afterEach rather than a `finally`: a test that times out never runs the
// rest of its body, and a session left open blocks every later count.
test.afterEach(async ({ page }) => {
  const api = page.request;
  if (sessionId) await api.post(`/api/inventory-count/sessions/${sessionId}/complete`, { data: { corrections: [] } }).catch(() => {});
  sessionId = null;
  for (const productId of families.splice(0)) await api.delete(`/api/products/${productId}`).catch(() => {});
  if (cellarId) await api.delete(`/api/cellars/${cellarId}`).catch(() => {});
  cellarId = '';
});

test('a group is counted in one answer, its gaps corrected, a find of 6 makes a group ×6 (#471, FEAT-100)', async ({ page }) => {
  test.setTimeout(120_000);
  const api = page.request;
  const id = stamp();
  cellarId = (await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E #471 I2 ${id}` } }))).id;
  const missingName = `E2E #471 I2 Missing ${id}`;
  const surplusName = `E2E #471 I2 Surplus ${id}`;
  const findName = `E2E #471 I2 Find ${id}`;
  const missing = await group(api, cellarId, missingName, 6);
  const surplus = await group(api, cellarId, surplusName, 6);
  families.push(missing.productId, surplus.productId);

  const start = await api.post('/api/inventory-count/sessions', { data: { scopeLabel: `E2E #471 I2 ${id}`, cellarId } });
  test.skip(start.status() === 409, 'another inventory count is already in progress on this instance');
  expect(start.status(), await start.text()).toBe(201);
  sessionId = ((await start.json()).data as { id: string }).id;

  await page.goto('/inventory-count');

  // c1: one line per group, "×6", the question prefilled with 6.
  const missingRow = page.locator('li', { hasText: missingName });
  await expect(missingRow).toHaveCount(1);
  await expect(missingRow.getByText('×6')).toBeVisible();
  const missingAnswer = page.getByRole('spinbutton', { name: `${missingName} : combien en avez-vous trouvé ?` });
  await expect(missingAnswer).toHaveValue('6');

  // c2 / c3: 4 found of one, 8 of the other.
  await missingAnswer.fill('4');
  await missingRow.getByRole('button', { name: 'Valider' }).click();
  await expect(missingRow.getByText('4 / 6')).toBeVisible();
  const surplusRow = page.locator('li', { hasText: surplusName });
  await page.getByRole('spinbutton', { name: `${surplusName} : combien en avez-vous trouvé ?` }).fill('8');
  await surplusRow.getByRole('button', { name: 'Valider' }).click();
  await expect(surplusRow.getByText('8 / 6')).toBeVisible();

  // c4: a find of 6 bottles of an unknown wine.
  await page.getByRole('button', { name: 'Introuvable dans la liste ? Enregistrer une trouvaille' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nom', { exact: true }).fill(findName);
  await dialog.getByLabel('Nombre trouvé').fill('6');
  await dialog.getByRole('button', { name: 'Ajouter' }).click();
  await expect(dialog).toBeHidden();

  // The report: 2 missing of 6 → broken / given away / lost; 2 more → added; the find → added.
  await page.getByRole('tab', { name: 'Bilan' }).click();
  await expect(page.getByText('2 manquantes sur 6')).toBeVisible();
  // HeroUI's radios and checkboxes are visually hidden inputs: a DOM click
  // is what the member's tap on their label amounts to.
  const writtenOff = page.getByRole('radiogroup', { name: `Que faire des bouteilles manquantes de ${missingName} ?` })
    .getByRole('radio', { name: 'Cassées / offertes / perdues' });
  await writtenOff.dispatchEvent('click');
  await expect(writtenOff).toBeChecked();
  const addSurplus = page.getByRole('checkbox', { name: 'Ajouter 2 bouteilles au groupe' });
  await addSurplus.dispatchEvent('click');
  await expect(addSurplus).toBeChecked();
  const addFind = page.getByRole('checkbox', { name: `Ajouter 6 bouteilles à la cave — ${findName}` });
  await addFind.dispatchEvent('click');
  await expect(addFind).toBeChecked();
  await page.getByRole('button', { name: 'Clôturer et appliquer (3)' }).click();
  // Closed: the screen offers to start the next count.
  await expect(page.getByText("Démarrer une session d'inventaire").first()).toBeVisible();
  sessionId = null;

  // ×4 with 2 written off (none drunk); ×8; a new card with a group ×6.
  const missingUnits = (await okData<{ items: Unit[] }>(await api.get(`/api/products/${missing.productId}`))).items;
  expect(missingUnits.find((unit) => unit.id === missing.id)).toMatchObject({ quantity: 4, writtenOffAt: null });
  expect(missingUnits.filter((unit) => unit.isOpened)).toEqual([]);
  expect((await okData<{ items: Unit[] }>(await api.get(`/api/products/${surplus.productId}`))).items)
    .toEqual([expect.objectContaining({ id: surplus.id, quantity: 8 })]);
  const found = (await okData<{ id: string; name: string; items: Unit[] }[]>(await api.get('/api/products'))).filter((card) => card.name === findName);
  expect(found).toHaveLength(1);
  families.push(found[0].id);
  expect(found[0].items).toEqual([expect.objectContaining({ quantity: 6 })]);
});
