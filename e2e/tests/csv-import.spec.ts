import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * FEAT-91 (#577): a cellar file imports every bottle it describes. A case of
 * 6 gives 6 bottles whether it is written as one row with quantity 6 or as
 * six identical rows, and a row is only skipped when that bottle was in stock
 * before the import.
 *
 * Run here rather than in `api/tests/` because those mock Prisma: the
 * "in stock" scope is a SQL filter (`NOT` over a nullable `fillLevel`,
 * `isOwned`, `deletedAt`), which only a real PostgreSQL exercises. API-level
 * only, on a cellar created for each test so the counts are isolated.
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

type Row = { id: string; name: string };
type ImportRow = Record<string, unknown>;

/** Asserts a 2xx and returns the `{ data }` envelope's content. */
async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

async function createCellar(api: APIRequestContext, label: string): Promise<string> {
  const cellar = await okData<Row>(
    await api.post('/api/cellars', { data: { name: `E2E FEAT-91 ${label} ${stamp()}`, columns: 3, rows: 3 } }),
  );
  return cellar.id;
}

/** Uploads a CSV the way the wizard does, then confirms its valid rows into `cellarId`. */
async function importCsv(api: APIRequestContext, csv: string, cellarId: string) {
  const preview = await okData<{ valid: ImportRow[]; errors: unknown[] }>(
    await api.post('/api/import/csv/preview', {
      multipart: { file: { name: 'cave.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') } },
    }),
  );
  expect(preview.errors).toEqual([]);
  const result = await okData<{ created: number; skippedDuplicates: number }>(
    await api.post('/api/import/csv/confirm', { data: { rows: preview.valid, cellarId } }),
  );
  return { preview, result };
}

/** Ids of every item (trash excluded) whose name carries this test's stamp. */
async function itemsNamed(api: APIRequestContext, id: string): Promise<Row[]> {
  return (await okData<Row[]>(await api.get('/api/inventory'))).filter((item) => item.name.includes(id));
}

async function cellarCount(api: APIRequestContext, cellarId: string): Promise<number> {
  const cellar = await okData<{ stats: { totalItems: number } }>(await api.get(`/api/cellars/${cellarId}`));
  return cellar.stats.totalItems;
}

test('a case of 6 imports 6 bottles, as one row with a quantity or as six identical rows', async ({ page }) => {
  const api = page.request;
  const id = stamp();
  let cellarId = '';
  try {
    cellarId = await createCellar(api, 'quantity');
    const csv = [
      'Nom;Producteur;Catégorie;Millésime;Quantité',
      `Talbot ${id};Château Talbot;Vin;2015;6`,
      ...Array.from({ length: 6 }, () => `Gloria ${id};Château Gloria;Vin;2016;`),
    ].join('\n');

    const { preview, result } = await importCsv(api, csv, cellarId);

    expect(preview.valid).toHaveLength(7);
    expect(result).toEqual({ created: 12, skippedDuplicates: 0 });
    expect(await cellarCount(api, cellarId)).toBe(12);
  } finally {
    for (const item of await itemsNamed(api, id)) await api.delete(`/api/inventory/${item.id}`).catch(() => {});
    if (cellarId) await api.delete(`/api/cellars/${cellarId}`).catch(() => {});
  }
});

test('only a bottle in stock before the import makes a row "already there"', async ({ page }) => {
  const api = page.request;
  const id = stamp();
  let cellarId = '';
  try {
    cellarId = await createCellar(api, 'in-stock');
    const wine = async (name: string, extra: Record<string, unknown> = {}) =>
      (await okData<Row>(await api.post('/api/inventory', {
        data: { category: 'wine', name: `${name} ${id}`, producer: 'E2E Domaine', vintage: 2015, cellarId, ...extra },
      }))).id;

    await wine('InStock');
    // Drunk: opened and empty.
    const finished = await wine('Finished');
    await okData(await api.patch(`/api/inventory/${finished}`, { data: { isOpened: true, fillLevel: 0 } }));
    // Opened, level never entered: still in stock (the nullable `fillLevel` case).
    await wine('Opened', { isOpened: true });
    // Followed but never bought.
    await wine('Reference', { isOwned: false });
    // In the trash.
    const trashed = await wine('Trashed');
    await okData(await api.delete(`/api/inventory/${trashed}`));

    const csv = [
      'name,producer,category,vintage',
      ...['InStock', 'Finished', 'Opened', 'Reference', 'Trashed'].map((name) => `${name} ${id},E2E Domaine,wine,2015`),
    ].join('\n');

    const { result } = await importCsv(api, csv, cellarId);

    // InStock and Opened were in stock; the three others are new purchases.
    expect(result).toEqual({ created: 3, skippedDuplicates: 2 });
    const imported = (await itemsNamed(api, id)).map((item) => item.name.replace(` ${id}`, '')).sort();
    expect(imported).toEqual(['Finished', 'Finished', 'InStock', 'Opened', 'Reference', 'Reference', 'Trashed']);
  } finally {
    for (const item of await itemsNamed(api, id)) await api.delete(`/api/inventory/${item.id}`).catch(() => {});
    if (cellarId) await api.delete(`/api/cellars/${cellarId}`).catch(() => {});
  }
});
