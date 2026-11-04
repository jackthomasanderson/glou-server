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
  quantity: number | null; cellarId: string | null; purchasePrice: number | null; purchasedAt: string | null;
  cigarsPerBox: number | null; cigarsLeft: number | null; isOpened: boolean; fillLevel: number | null; bottleSize: string | null;
};
type Family = { id: string; name: string; items: Unit[] };
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
    family.name, u.quantity, u.cellarId ? cellars.get(u.cellarId) : null, u.purchasePrice, u.purchasedAt,
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
  test('c3-c4: the export of a stock reimports to the same stock', async ({ page }) => {
    const api = page.request;
    const id = stamp();
    const cave = `Cave, "A" ${id}`;
    const csvCave = cave.replace(/"/g, '""');
    const humidor = `Humidor ${id}`;
    try {
      const source = [
        'name,producer,category,vintage,quantity,price,purchase date,cellar,bottle size,cigars per box,opened,fill level,cigars left',
        `"Talbot, ${id}",Château Talbot,wine,2015,4,20,2024-01-15,"${csvCave}",75cl,,,,`,
        `"Talbot, ${id}",Château Talbot,wine,2015,2,25,2024-06-10,"${csvCave}",,,,,`,
        `"Talbot, ${id}",Château Talbot,wine,2015,,20,,"${csvCave}",,,yes,40,`,
        `=Cohiba ${id},Cohiba,cigar,,3,150,2024-03-01,${humidor},,20,,,`,
        `=Cohiba ${id},Cohiba,cigar,,,150,2024-03-01,${humidor},,20,yes,,7`,
      ].join('\n');
      expect(await importCsv(api, source)).toMatchObject({ bottles: 7, cigars: 67, createdCellars: [cave, humidor] });
      const before = await stockOf(api, id);
      expect(before).toHaveLength(5);

      const res = await api.get('/api/inventory/export.csv?lang=en');
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('text/csv');
      expect(res.headers()['content-disposition']).toContain('attachment');
      const text = await res.text();
      expect(text.charCodeAt(0)).toBe(0xfeff);
      // c3: the wine makes 3 lines (a group ×4, a group ×2, an opened bottle), the cigars 2.
      const ours = text.split('\r\n').filter((line) => line.includes(id));
      expect(ours).toHaveLength(5);
      expect(ours.filter((line) => line.includes('Talbot'))).toHaveLength(3);
      // A name starting with "=" is not a formula in the spreadsheet.
      expect(ours.some((line) => line.startsWith(`'=Cohiba`))).toBe(true);
      expect(ours.some((line) => line.startsWith(`=Cohiba`))).toBe(false);

      // c4: after deleting the wines and the cellars, the export gives the stock back.
      const header = text.split('\r\n')[0].replace(/^﻿/, '');
      await wipe(api, id);
      expect(await stockOf(api, id)).toEqual([]);
      const reimport = await importCsv(api, [header, ...ours].join('\r\n'));
      expect(reimport).toMatchObject({ bottles: 7, cigars: 67 });
      expect([...reimport.createdCellars].sort()).toEqual([cave, humidor].sort());
      expect(await stockOf(api, id)).toEqual(before);
    } finally {
      await wipe(api, id);
    }
  });

  test('the French export reimports too, with its French headers', async ({ page }) => {
    const api = page.request;
    const id = stamp();
    try {
      await importCsv(api, ['name,producer,category,vintage,quantity,price,cellar', `Margaux ${id},Château Margaux,wine,2010,6,80,Cave ${id}`].join('\n'));
      const before = await stockOf(api, id);
      const text = await (await api.get('/api/inventory/export.csv?lang=fr')).text();
      expect(text).toContain("Nom,Producteur,Catégorie,Millésime,Quantité,Prix d'achat");
      const lines = text.replace(/^﻿/, '').split('\r\n');
      await wipe(api, id);

      await importCsv(api, [lines[0], ...lines.filter((line) => line.includes(id))].join('\r\n'));
      expect(await stockOf(api, id)).toEqual(before);
    } finally {
      await wipe(api, id);
    }
  });

  test('is for signed-in members only', async ({ baseURL }) => {
    const anonymous = await request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    try {
      expect((await anonymous.get('/api/inventory/export.csv')).status()).toBe(401);
    } finally {
      await anonymous.dispose();
    }
  });
});
