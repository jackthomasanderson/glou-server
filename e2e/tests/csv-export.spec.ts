import { test, expect, request, type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * #471 (FEAT-99 c3, c4): the CSV export writes one line per group in stock
 * and per opened bottle or box, and reimporting it (here after the wines and
 * cellars were deleted) gives back the same stock: same groups ×N, same
 * cellars, same prices, same opened units. API level on a real PostgreSQL
 * (the SQL scope of the export, the family lock and the import transaction
 * only run there); the screen's button is covered by useCsvExport.test.tsx.
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

type Unit = {
  purchasePlace: string | null; location: string | null; estimatedValue: number | null; openedAt: string | null; needsReview: boolean;
  quantity: number | null; cellarId: string | null; purchasePrice: number | null; purchasedAt: string | null;
  cigarsPerBox: number | null; cigarsLeft: number | null; isOpened: boolean; fillLevel: number | null; bottleSize: string | null;
};
type Family = {
  id: string; name: string; items: Unit[];
  color: string | null; appellation: string | null; classification: string | null; grapeVarieties: string[]; tags: string[];
  notes: string | null; peakMaturityFrom: number | null; peakMaturityTo: number | null;
};
type Preview = { valid: Record<string, unknown>[]; errors: unknown[] };

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

async function importCsv(api: APIRequestContext, csv: string) {
  const { valid, errors } = await okData<Preview>(await api.post('/api/import/csv/preview', {
    multipart: { file: { name: 'cave.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') } },
  }));
  expect(errors).toEqual([]);
  return okData<{ bottles: number; cigars: number; createdCellars: string[] }>(
    await api.post('/api/import/csv/confirm', { data: { rows: valid, cellarId: null, choices: [] } }),
  );
}

/** What the stock is, without ids: one sorted line per unit, its cellar by name. */
async function stockOf(api: APIRequestContext, id: string): Promise<string[]> {
  const cellars = new Map((await okData<Array<{ id: string; name: string }>>(await api.get('/api/cellars'))).map((c) => [c.id, c.name]));
  const families = (await okData<Family[]>(await api.get('/api/products'))).filter((f) => f.name.includes(id));
  return families.flatMap((family) => family.items.map((u) => JSON.stringify([
    family.name, family.color, family.appellation, family.grapeVarieties, family.tags, family.notes,
    family.peakMaturityFrom, family.peakMaturityTo,
    u.purchasePlace, u.location, u.estimatedValue, u.openedAt?.slice(0, 10) ?? null, u.needsReview, u.quantity, u.cellarId ? cellars.get(u.cellarId) : null, u.purchasePrice, u.purchasedAt,
    u.cigarsPerBox, u.isOpened, u.fillLevel, u.cigarsLeft, u.bottleSize,
  ]))).sort();
}

async function wipe(api: APIRequestContext, id: string) {
  const cellars = await okData<Array<{ id: string; name: string }>>(await api.get('/api/cellars'));
  for (const family of (await okData<Family[]>(await api.get('/api/products'))).filter((f) => f.name.includes(id))) {
    await api.delete(`/api/products/${family.id}`).catch(() => {});
  }
  for (const cellar of cellars.filter((c) => c.name.includes(id))) await api.delete(`/api/cellars/${cellar.id}`).catch(() => {});
}

test.describe('CSV export (#471, FEAT-99)', () => {
  /** A CSV from objects: every cell quoted, so a comma, a quote or a line break in it is data. */
  const csvOf = (columns: string[], rows: Array<Record<string, string | number>>) =>
    [columns, ...rows.map((row) => columns.map((column) => row[column] ?? ''))]
      .map((cells) => cells.map((cell) => (cell === '' ? '' : `"${String(cell).replace(/"/g, '""')}"`)).join(','))
      .join('\n');

  for (const lang of ['en', 'fr'] as const) {
    test(`c3-c4 (${lang}): the export of a stock reimports to the same stock, groups, places and descriptions included`, async ({ page }) => {
      const api = page.request;
      const id = stamp();
      const cave = `Cave, "A" ${id}`;
      const humidor = `Humidor ${id}`;
      const talbot = `Talbot, ${id}`;
      const columns = [
        'name', 'producer', 'category', 'vintage', 'quantity', 'price', 'purchase date', 'cellar', 'bottle size', 'cigars per box',
        'opened', 'fill level', 'cigars left', 'opened on', 'purchase place', 'location', 'estimated value', 'to check',
        'colour', 'appellation', 'grapes', 'tags', 'notes', 'drink from', 'drink until',
      ];
      const wine = { name: talbot, producer: 'Château Talbot', category: 'wine', vintage: 2015, cellar: cave };
      const cohiba = { name: `=Cohiba ${id}`, producer: 'Cohiba', category: 'cigar', cellar: humidor, 'cigars per box': 20, price: 150 };
      const source = csvOf(columns, [
        {
          ...wine, quantity: 4, price: 20, 'purchase date': '2024-01-15', 'bottle size': '75cl', 'purchase place': 'Nicolas',
          colour: 'red', appellation: 'Saint-Julien', grapes: 'Cabernet|Merlot', tags: 'fête|cadeau', notes: 'Ligne un\nligne "deux", fin',
          'drink from': 2025, 'drink until': 2040,
        },
        { ...wine, quantity: 2, price: 25, 'purchase date': '2024-06-10' },
        // Same wine, cellar, price and day as the first: only the place and location tell it apart.
        { ...wine, quantity: 2, price: 20, 'purchase date': '2024-01-15', 'purchase place': 'Salon des vins', location: 'Étagère 2', 'estimated value': 30 },
        { ...wine, opened: 'yes', 'fill level': 40, 'opened on': '2025-02-03', price: 20 },
        { ...wine, quantity: 1, price: 20, 'purchase date': '2024-02-02', 'to check': 'yes' },
        { ...cohiba, quantity: 3, 'purchase date': '2024-03-01' },
        { ...cohiba, opened: 'yes', 'cigars left': 7, 'purchase date': '2024-03-01' },
      ]);
      try {
        expect(await importCsv(api, source)).toMatchObject({ bottles: 10, cigars: 67, createdCellars: [cave, humidor] });
        const before = await stockOf(api, id);
        expect(before).toHaveLength(7);

        const res = await api.get(`/api/inventory/export.csv?lang=${lang}`);
        expect(res.status()).toBe(200);
        expect(res.headers()['content-type']).toContain('text/csv');
        expect(res.headers()['content-disposition']).toContain('attachment');
        const text = await res.text();
        expect(text.charCodeAt(0)).toBe(0xfeff);
        expect(text.split('\r\n')[0]).toContain(lang === 'fr' ? 'Nom;Producteur;Catégorie' : 'Name,Producer,Category');
        // c3: the wine makes 5 lines (groups ×4, ×2, ×2, an opened bottle, a group to check), the cigars 2.
        const ours = text.split('\r\n').filter((line) => line.includes(id));
        expect(ours).toHaveLength(7);
        expect(ours.filter((line) => line.includes('Talbot'))).toHaveLength(5);
        // A name starting with "=" is not a formula in the spreadsheet.
        expect(ours.some((line) => line.startsWith(`'=Cohiba`))).toBe(true);
        expect(ours.some((line) => line.startsWith(`=Cohiba`))).toBe(false);

        // c4: after deleting the wines and the cellars, the export gives the stock back, line for line.
        const header = text.split('\r\n')[0].replace(/^﻿/, '');
        await wipe(api, id);
        expect(await stockOf(api, id)).toEqual([]);
        const reimport = await importCsv(api, [header, ...ours].join('\r\n'));
        expect(reimport).toMatchObject({ bottles: 10, cigars: 67 });
        expect([...reimport.createdCellars].sort()).toEqual([cave, humidor].sort());
        expect(await stockOf(api, id)).toEqual(before);
      } finally {
        await wipe(api, id);
      }
    });
  }

  test('is for signed-in members only', async ({ baseURL }) => {
    const anonymous = await request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    try {
      expect((await anonymous.get('/api/inventory/export.csv')).status()).toBe(401);
    } finally {
      await anonymous.dispose();
    }
  });
});
