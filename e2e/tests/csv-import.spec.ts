import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * #471 (FEAT-99 c1, c2, c4): a cellar file imports groups, not one line per
 * bottle. A row of quantity 6 is a group ×6; identical rows of one file add
 * up; a row joins the family of the same wine; a wine already in the cellar
 * is left out unless the member chose to add it; an unknown cellar is
 * created; the cap is 500 rows, whatever the bottles; a second "Confirm"
 * adds nothing.
 *
 * Run here rather than in `api/tests/` because those mock Prisma: the
 * "in stock" scope, the family lock and the advisory lock that serialises
 * two confirmations only run on a real PostgreSQL. API level only, on a
 * cellar created for each test; the screen is covered by CsvImportStep.test.tsx.
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

type ImportRow = Record<string, unknown>;
type Line = { key: string; count: number; rowCount: number; units: number; inStock: number; newCellar: boolean; row: { name: string } };
type Preview = { valid: ImportRow[]; errors: unknown[]; lines: Line[]; newCellars: string[] };
type Result = {
  bottles: number; wines: number; cigars: number; cigarReferences: number;
  skippedLines: number; skippedUnits: number; createdCellars: string[];
};
type Unit = { id: string; quantity: number; cellarId: string | null; purchasePrice: number | null; purchasedAt: string | null; cigarsPerBox: number | null };
type Family = { id: string; name: string; items: Unit[] };
type Choice = { key: string; inStock: number; add: boolean };

/** Asserts a 2xx and returns the `{ data }` envelope's content. */
async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

async function createCellar(api: APIRequestContext, label: string): Promise<string> {
  const cellar = await okData<{ id: string }>(
    await api.post('/api/cellars', { data: { name: `E2E FEAT-99 ${label} ${stamp()}`, columns: 3, rows: 3 } }),
  );
  return cellar.id;
}

/** Uploads a CSV the way the wizard does. */
async function preview(api: APIRequestContext, csv: string): Promise<Preview> {
  const result = await okData<Preview>(await api.post('/api/import/csv/preview', {
    multipart: { file: { name: 'cave.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') } },
  }));
  expect(result.errors).toEqual([]);
  return result;
}

function confirm(api: APIRequestContext, rows: ImportRow[], cellarId: string | null, choices: Choice[] = []) {
  return api.post('/api/import/csv/confirm', { data: { rows, cellarId, choices } });
}

/** Families (trash excluded) whose name carries this test's stamp. */
async function familiesNamed(api: APIRequestContext, id: string): Promise<Family[]> {
  return (await okData<Family[]>(await api.get('/api/products'))).filter((family) => family.name.includes(id));
}

const unitsOf = (family: Family | undefined) => (family?.items ?? []).reduce((n, unit) => n + unit.quantity, 0);

async function cleanUp(api: APIRequestContext, id: string, cellarIds: string[]) {
  for (const family of await familiesNamed(api, id)) await api.delete(`/api/products/${family.id}`).catch(() => {});
  for (const cellarId of cellarIds) await api.delete(`/api/cellars/${cellarId}`).catch(() => {});
}

test.describe('CSV import by groups (#471, FEAT-99)', () => {
  test('c1: a row of quantity 6 is one wine with a group ×6, "6 bottles · 1 wine"', async ({ page }) => {
    const api = page.request;
    const id = stamp();
    const cellars: string[] = [];
    try {
      const cellarId = await createCellar(api, 'c1');
      cellars.push(cellarId);
      const { valid } = await preview(api, ['Nom;Producteur;Catégorie;Millésime;Quantité', `Talbot ${id};Château Talbot;Vin;2015;6`].join('\n'));

      const result = await okData<Result>(await confirm(api, valid, cellarId));

      expect(result).toEqual({ bottles: 6, wines: 1, cigars: 0, cigarReferences: 0, skippedLines: 0, skippedUnits: 0, createdCellars: [] });
      const [family, ...others] = await familiesNamed(api, id);
      expect(others).toEqual([]);
      expect(family.items.map((unit) => [unit.quantity, unit.cellarId])).toEqual([[6, cellarId]]);
      const cellar = await okData<{ stats: { bottles: number } }>(await api.get(`/api/cellars/${cellarId}`));
      expect(cellar.stats.bottles).toBe(6);
    } finally {
      await cleanUp(api, id, cellars);
    }
  });

  test('c2: identical rows add up into one group; another purchase day stays a group of the same wine', async ({ page }) => {
    const api = page.request;
    const id = stamp();
    const cellars: string[] = [];
    try {
      const cellarId = await createCellar(api, 'c2');
      cellars.push(cellarId);
      const csv = [
        'name,producer,category,vintage,quantity,price,purchase date',
        `Gloria ${id},Château Gloria,wine,2016,3,20,15/01/2024`,
        `Gloria ${id},château gloria ,wine,2016,3,20,2024-01-15`,
        `Gloria ${id},Château Gloria,wine,2016,2,20,2024-06-10`,
      ].join('\n');
      const { valid, lines } = await preview(api, csv);
      expect(lines.map(({ count, rowCount }) => [count, rowCount])).toEqual([[6, 2], [2, 1]]);

      const result = await okData<Result>(await confirm(api, valid, cellarId));

      expect(result).toMatchObject({ bottles: 8, wines: 1 });
      const [family, ...others] = await familiesNamed(api, id);
      expect(others).toEqual([]);
      expect(family.items.map((unit) => [unit.quantity, unit.purchasedAt]).sort()).toEqual([[2, '2024-06-10'], [6, '2024-01-15']]);
    } finally {
      await cleanUp(api, id, cellars);
    }
  });

  test('c2: a wine already in the cellar is ignored by default, added when chosen, never twice', async ({ page }) => {
    const api = page.request;
    const id = stamp();
    const cellars: string[] = [];
    try {
      const cellarId = await createCellar(api, 'in-cellar');
      cellars.push(cellarId);
      const known = await okData<{ productId: string }>(await api.post('/api/inventory', {
        data: { category: 'wine', name: `Pétrus ${id}`, producer: 'Château Pétrus', vintage: 2015, cellarId },
      }));
      await okData(await api.post(`/api/products/${known.productId}/items`, { data: { quantity: 3, cellarId } }));
      const csv = ['name,producer,category,vintage,quantity', `PÉTRUS ${id},Château Pétrus,wine,2015,6`].join('\n');

      const { valid, lines: [line] } = await preview(api, csv);
      expect(line).toMatchObject({ inStock: 4, units: 6 });

      // "Ignorer (déjà comptées)": the default, and what a client that sends no choice gets.
      const ignored = await okData<Result>(await confirm(api, valid, cellarId, [{ key: line.key, inStock: 4, add: false }]));
      expect(ignored).toMatchObject({ bottles: 0, skippedLines: 1, skippedUnits: 6 });
      expect(await okData<Result>(await confirm(api, valid, cellarId))).toMatchObject({ bottles: 0, skippedLines: 1 });

      // "Ajouter ces 6 bouteilles": joins the known family. Sent twice (a
      // double click), it adds them once: the stock no longer is the one shown.
      const choices = [{ key: line.key, inStock: 4, add: true }];
      const [first, second] = await Promise.all([confirm(api, valid, cellarId, choices), confirm(api, valid, cellarId, choices)]);
      const results = [await okData<Result>(first), await okData<Result>(second)];
      expect(results.map((result) => result.bottles).sort()).toEqual([0, 6]);

      const families = await familiesNamed(api, id);
      expect(families.map((family) => family.id)).toEqual([known.productId]);
      expect(unitsOf(families[0])).toBe(10);
    } finally {
      await cleanUp(api, id, cellars);
    }
  });

  test('a double click on "Confirm" imports a new wine once', async ({ page }) => {
    const api = page.request;
    const id = stamp();
    const cellars: string[] = [];
    try {
      const cellarId = await createCellar(api, 'double');
      cellars.push(cellarId);
      const { valid } = await preview(api, ['name,producer,category,quantity', `Le Pin ${id},Le Pin,wine,6`].join('\n'));

      const responses = await Promise.all([confirm(api, valid, cellarId), confirm(api, valid, cellarId)]);
      const results = await Promise.all(responses.map((res) => okData<Result>(res)));

      expect(results.map((result) => result.bottles).sort()).toEqual([0, 6]);
      expect(unitsOf((await familiesNamed(api, id))[0])).toBe(6);
    } finally {
      await cleanUp(api, id, cellars);
    }
  });

  test('QP3: an unknown cellar is announced by the preview, then created and named in the result', async ({ page }) => {
    const api = page.request;
    const id = stamp();
    const cellars: string[] = [];
    const kitchen = `E2E Cuisine ${id}`;
    try {
      const csv = [
        'Nom;Producteur;Catégorie;Cave;Quantité;Format de boîte',
        `Margaux ${id};Château Margaux;Vin;${kitchen};2;`,
        `Margaux ${id};Château Margaux;Vin;${kitchen.toUpperCase()};1;`,
        `Robusto ${id};Cohiba;Cigare;${kitchen};3;25`,
        `Robusto ${id};Cohiba;Cigare;${kitchen};4;à l'unité`,
      ].join('\n');
      const { valid, newCellars, lines } = await preview(api, csv);
      expect(newCellars).toEqual([kitchen]);
      expect(lines.every((line) => line.newCellar)).toBe(true);

      const result = await okData<Result>(await confirm(api, valid, null));

      expect(result).toMatchObject({ bottles: 3, wines: 1, cigars: 79, cigarReferences: 1, createdCellars: [kitchen] });
      const created = (await okData<Array<{ id: string; name: string }>>(await api.get('/api/cellars'))).filter((c) => c.name === kitchen);
      expect(created).toHaveLength(1);
      cellars.push(created[0].id);
      const cigars = (await familiesNamed(api, id)).find((family) => family.name.startsWith('Robusto'));
      expect(cigars?.items.map((unit) => [unit.quantity, unit.cigarsPerBox]).sort()).toEqual([[3, 25], [4, null]]);
    } finally {
      await cleanUp(api, id, cellars);
    }
  });

  test('c4: 500 rows are accepted however many bottles they stand for, 501 are refused', async ({ page }) => {
    const api = page.request;
    const id = stamp();
    const cellars: string[] = [];
    try {
      const cellarId = await createCellar(api, 'c4');
      cellars.push(cellarId);
      // One wine bought at 500 prices: 500 groups of 2, 1,000 bottles.
      const rows = Array.from({ length: 500 }, (_, i) => `Lafite ${id},Château Lafite,wine,2010,2,${i + 1}`);
      const { valid } = await preview(api, ['name,producer,category,vintage,quantity,price', ...rows].join('\n'));
      expect(valid).toHaveLength(500);

      const tooMany = await confirm(api, [...valid, { ...valid[0], purchasePrice: 999 }], cellarId);
      expect(tooMany.status()).toBe(400);
      expect(await tooMany.text()).toContain('TOO_MANY_ROWS');

      const result = await okData<Result>(await confirm(api, valid, cellarId));
      expect(result).toMatchObject({ bottles: 1000, wines: 1 });
      const [family] = await familiesNamed(api, id);
      expect(family.items).toHaveLength(500);
      expect(unitsOf(family)).toBe(1000);
    } finally {
      await cleanUp(api, id, cellars);
    }
  });
});
