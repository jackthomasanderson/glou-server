import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * FEAT-93 (#847, lot S1): several cells of the cellar plan per line, at the
 * API level on the real PostgreSQL — the partial unique index of live cells,
 * the key holding a cell in its bottle's cellar and the deferred guard (no
 * more cells than bottles, none once out of stock or in the trash) are only
 * exercised here (api/tests mock Prisma). The plan's interface is lot S3.
 */

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

type Slot = { id: string; column: number; row: number };
type Unit = { id: string; productId: string; quantity: number | null; cellarId: string | null; slots: Slot[] };
type GridLine = { id: string; slots: Slot[]; unplaced: number };

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

const cells = (slots: Slot[]) => slots.map((slot) => `${slot.column}:${slot.row}`).sort();

test.describe('cells of the cellar plan (FEAT-93)', () => {
  let families: string[] = [];
  let cellars: string[] = [];
  test.afterEach(async ({ page }) => {
    const api = page.request;
    for (const productId of families) await api.delete(`/api/products/${productId}`).catch(() => {});
    for (const cellarId of cellars) await api.delete(`/api/cellars/${cellarId}`).catch(() => {});
    families = [];
    cellars = [];
  });

  async function cellar(api: APIRequestContext): Promise<string> {
    const id = (await okData<{ id: string }>(await api.post('/api/cellars', { data: { name: `E2E slots ${stamp()}`, columns: 6, rows: 4 } }))).id;
    cellars.push(id);
    return id;
  }

  /** A group of `quantity` bottles at 20 € in `cellarId`. */
  async function group(api: APIRequestContext, cellarId: string, quantity: number): Promise<Unit> {
    const unit = await okData<Unit>(await api.post('/api/inventory', {
      data: { category: 'wine', name: `E2E slots ${stamp()}`, producer: 'E2E Domaine', purchasePrice: 20, cellarId },
    }));
    families.push(unit.productId);
    if (quantity === 1) return unit;
    return okData<Unit>(await api.patch(`/api/inventory/${unit.id}`, { data: { quantity } }));
  }

  const place = (api: APIRequestContext, itemId: string, column: number, row: number) =>
    api.post(`/api/inventory/${itemId}/slots`, { data: { column, row } });

  const unit = async (api: APIRequestContext, id: string) => okData<Unit>(await api.get(`/api/inventory/${id}`));

  test('c1-c2: a group x6 placed in 6 cells shows in those 6 cells; a 7th is refused with the numbers', async ({ page }) => {
    const api = page.request;
    const cellarId = await cellar(api);
    const six = await group(api, cellarId, 6);

    for (let column = 1; column <= 2; column++) expect((await place(api, six.id, column, 1)).status()).toBe(201);
    let grid = await okData<{ items: GridLine[] }>(await api.get(`/api/cellars/${cellarId}/grid`));
    expect(grid.items).toEqual([expect.objectContaining({ id: six.id, unplaced: 4 })]);

    for (let column = 3; column <= 6; column++) expect((await place(api, six.id, column, 1)).status()).toBe(201);
    grid = await okData<{ items: GridLine[] }>(await api.get(`/api/cellars/${cellarId}/grid`));
    expect(cells(grid.items[0].slots)).toEqual(['1:1', '2:1', '3:1', '4:1', '5:1', '6:1']);
    expect(grid.items[0].unplaced).toBe(0);

    const seventh = await place(api, six.id, 1, 2);
    expect(seventh.status()).toBe(409);
    expect(await seventh.json()).toMatchObject({ error: 'NO_UNPLACED_COPY', details: { quantity: 6, placed: 6 } });
  });

  test('a held cell is refused, a cell outside the grid too; a cell moves, comes out, and two swap', async ({ page }) => {
    const api = page.request;
    const cellarId = await cellar(api);
    const a = await group(api, cellarId, 2);
    const b = await group(api, cellarId, 1);
    expect((await place(api, a.id, 1, 1)).status()).toBe(201);

    const taken = await place(api, b.id, 1, 1);
    expect(taken.status()).toBe(409);
    expect((await taken.json()).error).toBe('SLOT_OCCUPIED');
    expect((await place(api, b.id, 7, 1)).status()).toBe(400);

    const placedB = await okData<{ slot: Slot }>(await place(api, b.id, 2, 1));
    const [slotA] = (await unit(api, a.id)).slots;
    // Two cells swap: each bottle takes the other's cell.
    await okData(await api.post(`/api/cellars/${cellarId}/swap-slots`, { data: { slotAId: slotA.id, slotBId: placedB.slot.id } }));
    expect(cells((await unit(api, a.id)).slots)).toEqual(['2:1']);
    expect(cells((await unit(api, b.id)).slots)).toEqual(['1:1']);

    const [slotB] = (await unit(api, b.id)).slots;
    await okData(await api.patch(`/api/slots/${slotB.id}`, { data: { column: 4, row: 3 } }));
    expect(cells((await unit(api, b.id)).slots)).toEqual(['4:3']);
    await okData(await api.delete(`/api/slots/${slotB.id}`));
    expect((await unit(api, b.id)).slots).toEqual([]);
  });

  test('copies leaving free their cells, the most recently placed first (automatic rule until the choice of lot S2)', async ({ page }) => {
    const api = page.request;
    const cellarId = await cellar(api);
    const four = await group(api, cellarId, 4);
    for (let column = 1; column <= 4; column++) expect((await place(api, four.id, column, 1)).status()).toBe(201);

    // c4's numbers: corrected from 4 to 2 frees the two cells placed last.
    await okData(await api.post(`/api/inventory/${four.id}/correct`, { data: { quantity: 2, reason: 'input_error' } }));
    expect(cells((await unit(api, four.id)).slots)).toEqual(['1:1', '2:1']);

    // Moved to another cellar: the copies arrive unplaced, the cells they held freed.
    const other = await cellar(api);
    await okData(await api.post(`/api/inventory/${four.id}/move`, { data: { count: 1, cellarId: other } }));
    expect(cells((await unit(api, four.id)).slots)).toEqual(['1:1']);
    // The rest follows to the same cellar: its cell freed, it joins the identical line there.
    const joined = await okData<Unit>(await api.patch(`/api/inventory/${four.id}`, { data: { cellarId: other } }));
    expect(joined).toMatchObject({ cellarId: other, quantity: 2, slots: [] });
  });

  test('#174: a bottle in the trash keeps its cell without holding it; restored, it comes back unplaced if the cell was taken', async ({ page }) => {
    const api = page.request;
    const cellarId = await cellar(api);
    const kept = await group(api, cellarId, 1);
    const lost = await group(api, cellarId, 1);
    expect((await place(api, kept.id, 1, 1)).status()).toBe(201);
    expect((await place(api, lost.id, 2, 1)).status()).toBe(201);

    await okData(await api.delete(`/api/inventory/${kept.id}`));
    await okData(await api.delete(`/api/inventory/${lost.id}`));
    const newcomer = await group(api, cellarId, 1);
    expect((await place(api, newcomer.id, 2, 1)).status()).toBe(201);

    expect(cells((await okData<Unit>(await api.post(`/api/inventory/${kept.id}/restore`))).slots)).toEqual(['1:1']);
    expect((await okData<Unit>(await api.post(`/api/inventory/${lost.id}/restore`))).slots).toEqual([]);
    expect(cells((await unit(api, newcomer.id)).slots)).toEqual(['2:1']);
  });

  test('#579: deleting a cellar takes its cells with it; its bottles stay, without a cellar', async ({ page }) => {
    const api = page.request;
    const cellarId = await cellar(api);
    const two = await group(api, cellarId, 2);
    expect((await place(api, two.id, 1, 1)).status()).toBe(201);
    expect((await place(api, two.id, 2, 1)).status()).toBe(201);

    expect((await api.delete(`/api/cellars/${cellarId}`)).status()).toBe(204);
    cellars = cellars.filter((id) => id !== cellarId);

    expect(await unit(api, two.id)).toMatchObject({ cellarId: null, quantity: 2, slots: [] });
  });
});
