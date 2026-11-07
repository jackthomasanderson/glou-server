import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * FEAT-93 (#847, lots S1-S2): several cells of the cellar plan per line, at the
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

  // FEAT-93 criterion 4 (lot S2): when the copies left cannot hold every cell, the member names those freed.
  test('c4: copies corrected away or moved name the cells they free when it matters', async ({ page }) => {
    const api = page.request;
    const cellarId = await cellar(api);
    const four = await group(api, cellarId, 4);
    for (let column = 1; column <= 4; column++) expect((await place(api, four.id, column, 1)).status()).toBe(201);
    const slotAt = async (column: number) => (await unit(api, four.id)).slots.find((slot) => slot.column === column)!.id;

    // Corrected from 4 to 2 without naming the cells: refused, with what to choose from.
    const asked = await api.post(`/api/inventory/${four.id}/correct`, { data: { quantity: 2, reason: 'input_error' } });
    expect(asked.status()).toBe(409);
    const body = await asked.json();
    expect(body).toMatchObject({ error: 'SLOTS_TO_FREE_REQUIRED', details: { needed: 2 } });
    expect(cells(body.details.slots)).toEqual(['1:1', '2:1', '3:1', '4:1']);
    expect((await unit(api, four.id)).quantity).toBe(4);

    // The two cells named are the ones freed.
    await okData(await api.post(`/api/inventory/${four.id}/correct`, {
      data: { quantity: 2, reason: 'input_error', slotIds: [await slotAt(1), await slotAt(3)] },
    }));
    expect(cells((await unit(api, four.id)).slots)).toEqual(['2:1', '4:1']);

    // Moved to another cellar: one copy of two placed — its cell is named, freed.
    const other = await cellar(api);
    expect((await api.post(`/api/inventory/${four.id}/move`, { data: { count: 1, cellarId: other } })).status()).toBe(409);
    await okData(await api.post(`/api/inventory/${four.id}/move`, { data: { count: 1, cellarId: other, slotIds: [await slotAt(4)] } }));
    expect(cells((await unit(api, four.id)).slots)).toEqual(['2:1']);
    // The rest follows to the same cellar: its cell freed, it joins the identical line there.
    const joined = await okData<Unit>(await api.patch(`/api/inventory/${four.id}`, { data: { cellarId: other } }));
    expect(joined).toMatchObject({ cellarId: other, quantity: 2, slots: [] });
  });

  test('c4: copies leaving from unplaced ones need no choice', async ({ page }) => {
    const api = page.request;
    const cellarId = await cellar(api);
    const four = await group(api, cellarId, 4);
    expect((await place(api, four.id, 1, 1)).status()).toBe(201);

    await okData(await api.post(`/api/inventory/${four.id}/correct`, { data: { quantity: 2, reason: 'written_off' } }));
    expect(cells((await unit(api, four.id)).slots)).toEqual(['1:1']);
  });

  // Decision #471 point 74: repriced copies are unplaced ones first; a cell follows the new line only when unavoidable.
  test('a new price for part of a line: unplaced copies first, then the cells named follow the new line', async ({ page }) => {
    const api = page.request;
    const cellarId = await cellar(api);
    const three = await group(api, cellarId, 3);
    for (let column = 1; column <= 2; column++) expect((await place(api, three.id, column, 1)).status()).toBe(201);

    const asked = await api.post(`/api/inventory/${three.id}/reprice`, { data: { count: 2, purchasePrice: 25 } });
    expect(asked.status()).toBe(409);
    expect(await asked.json()).toMatchObject({ error: 'SLOTS_TO_FREE_REQUIRED', details: { needed: 1 } });

    const [first] = (await unit(api, three.id)).slots.filter((slot) => slot.column === 1);
    const repriced = await okData<Unit>(await api.post(`/api/inventory/${three.id}/reprice`, { data: { count: 2, purchasePrice: 25, slotIds: [first.id] } }));
    expect(repriced).toMatchObject({ quantity: 2 });
    expect(cells(repriced.slots)).toEqual(['1:1']);
    expect(cells((await unit(api, three.id)).slots)).toEqual(['2:1']);
  });

  // FEAT-93 lot S2 (ux-ui.md §10.4.2): "De quelle case ?" — asked only when it matters.
  test('opening or drinking one of a placed line: asked which cell; from a cell, that cell; from an unplaced one, none', async ({ page }) => {
    const api = page.request;
    const cellarId = await cellar(api);
    const three = await group(api, cellarId, 3);
    for (let column = 1; column <= 2; column++) expect((await place(api, three.id, column, 1)).status()).toBe(201);
    const [first, second] = (await unit(api, three.id)).slots.sort((a, b) => a.column - b.column);

    const asked = await api.patch(`/api/inventory/${three.id}`, { data: { isOpened: true } });
    expect(asked.status()).toBe(409);
    const body = await asked.json();
    expect(body).toMatchObject({ error: 'SLOT_CHOICE_REQUIRED', details: { unplaced: 1 } });
    expect(cells(body.details.slots)).toEqual(['1:1', '2:1']);

    // Opened from the first cell: the opened bottle holds it.
    const opened = await api.patch(`/api/inventory/${three.id}`, { data: { isOpened: true, fromSlotId: first.id } });
    expect(opened.status(), await opened.text()).toBe(200);
    const write = await opened.json() as { data: Unit; changed: Unit[] };
    expect(cells(write.data.slots)).toEqual(['1:1']);
    expect(cells(write.changed[0].slots)).toEqual(['2:1']);

    // The same cell again (a replay): it is no longer the line's.
    const stale = await api.patch(`/api/inventory/${three.id}`, { data: { isOpened: true, fillLevel: 0, fromSlotId: first.id } });
    expect(stale.status()).toBe(409);
    expect(await stale.json()).toMatchObject({ error: 'SLOT_CHANGED', details: { unplaced: 1 } });

    // Drunk from the unplaced copy: the line keeps its cell.
    await okData(await api.patch(`/api/inventory/${three.id}`, { data: { isOpened: true, fillLevel: 0, fromUnplaced: true } }));
    expect(cells((await unit(api, three.id)).slots)).toEqual(['2:1']);
    expect((await unit(api, three.id)).quantity).toBe(1);
    // A line of one is the bottle itself: never asked; drunk from its cell, the cell is freed.
    const last = await okData<Unit>(await api.patch(`/api/inventory/${three.id}`, { data: { isOpened: true, fillLevel: 0, fromSlotId: second.id } }));
    expect(last.slots).toEqual([]);
  });

  test('« Annuler » of a bottle alone drunk in its cell puts it back there; a cell taken since leaves it unplaced', async ({ page }) => {
    const api = page.request;
    const cellarId = await cellar(api);
    const one = await group(api, cellarId, 1);
    expect((await place(api, one.id, 3, 2)).status()).toBe(201);
    const undo = { isOpened: false, fillLevel: null, openedAt: null, placeAt: { column: 3, row: 2 } };

    await okData(await api.patch(`/api/inventory/${one.id}`, { data: { isOpened: true, fillLevel: 0 } }));
    const back = await okData<Unit>(await api.patch(`/api/inventory/${one.id}`, { data: undo }));
    expect(cells(back.slots)).toEqual(['3:2']);

    await okData(await api.patch(`/api/inventory/${one.id}`, { data: { isOpened: true, fillLevel: 0 } }));
    const newcomer = await group(api, cellarId, 1);
    expect((await place(api, newcomer.id, 3, 2)).status()).toBe(201);
    const unplaced = await api.patch(`/api/inventory/${one.id}`, { data: undo });
    expect(unplaced.status(), await unplaced.text()).toBe(200);
    expect((await unplaced.json()).data).toMatchObject({ isOpened: false, slots: [] });
    expect(cells((await unit(api, newcomer.id)).slots)).toEqual(['3:2']);
  });

  // Review of #854: the answer of a write never lists a cell the bottle just gave up.
  test('the answer of a PATCH carries the cells the bottle keeps: a line of one drunk, a count lowered', async ({ page }) => {
    const api = page.request;
    const cellarId = await cellar(api);
    const one = await group(api, cellarId, 1);
    expect((await place(api, one.id, 1, 1)).status()).toBe(201);
    const drunk = await okData<Unit>(await api.patch(`/api/inventory/${one.id}`, { data: { isOpened: true, fillLevel: 0 } }));
    expect(drunk.slots).toEqual([]);
    expect((await unit(api, one.id)).slots).toEqual([]);

    const three = await group(api, cellarId, 3);
    for (let column = 1; column <= 3; column++) expect((await place(api, three.id, column, 2)).status()).toBe(201);
    // Lot S2: a number written below the cells is refused — "Corriger le nombre" names the cells to free.
    const lowered = await api.patch(`/api/inventory/${three.id}`, { data: { quantity: 1 } });
    expect(lowered.status()).toBe(409);
    expect(await lowered.json()).toMatchObject({ error: 'SLOTS_TO_FREE_REQUIRED', details: { needed: 2 } });
    const kept = (await unit(api, three.id)).slots.filter((slot) => slot.column !== 1).map((slot) => slot.id);
    const corrected = await okData<Unit>(await api.post(`/api/inventory/${three.id}/correct`, { data: { quantity: 1, reason: 'input_error', slotIds: kept } }));
    expect(cells(corrected.slots)).toEqual(['1:2']);
    expect(cells((await unit(api, three.id)).slots)).toEqual(['1:2']);
  });

  test('a number restored from the history below the cells is refused, not a 500', async ({ page }) => {
    const api = page.request;
    const cellarId = await cellar(api);
    // ×3, corrected to 2 by hand, then back to 3: « 2 » is in its history.
    const three = await group(api, cellarId, 3);
    await okData(await api.patch(`/api/inventory/${three.id}`, { data: { quantity: 2 } }));
    await okData(await api.patch(`/api/inventory/${three.id}`, { data: { quantity: 3 } }));
    for (let column = 1; column <= 3; column++) expect((await place(api, three.id, column, 1)).status()).toBe(201);

    const restored = await api.post(`/api/inventory/${three.id}/rollback`, { data: { field: 'quantity', toValue: 2 } });
    expect(restored.status(), await restored.text()).toBe(409);
    expect(await restored.json()).toMatchObject({ error: 'SLOTS_TO_FREE_REQUIRED', details: { needed: 1 } });
  });

  // Review of #854 (nits): a category and a box size changed together; a restore after the family became single cigars.
  test('a wine made boxes of cigars in one write keeps its cells; a bottle trashed meanwhile comes back with what it may hold', async ({ page }) => {
    const api = page.request;
    const cellarId = await cellar(api);
    const three = await group(api, cellarId, 3);
    for (let column = 1; column <= 3; column++) expect((await place(api, three.id, column, 1)).status()).toBe(201);
    const boxes = await api.patch(`/api/inventory/${three.id}`, { data: { category: 'cigar', cigarsPerBox: 25 } });
    expect(boxes.status(), await boxes.text()).toBe(200);
    expect(cells((await unit(api, three.id)).slots)).toEqual(['1:1', '2:1', '3:1']);

    // A wine of two lines: ×1 and ×2 at another price, the ×2 in two cells, then trashed alone.
    const kept = await group(api, cellarId, 1);
    const trashed = await okData<Unit>(await api.post(`/api/products/${kept.productId}/items`, { data: { quantity: 2, cellarId, purchasePrice: 30 } }));
    for (let column = 1; column <= 2; column++) expect((await place(api, trashed.id, column, 3)).status()).toBe(201);
    await okData(await api.delete(`/api/inventory/${trashed.id}`));
    // Its wine made single cigars meanwhile: one cell for a whole line.
    const made = await api.patch(`/api/products/${kept.productId}`, { data: { category: 'cigar' } });
    expect(made.status(), await made.text()).toBe(200);
    const back = await api.post(`/api/inventory/${trashed.id}/restore`);
    expect(back.status(), await back.text()).toBe(200);
    expect((await back.json()).data.slots).toHaveLength(1);
  });

  test('a bulk count lowered and a wine made a cigar free the cells beyond, never a refused commit', async ({ page }) => {
    const api = page.request;
    const cellarId = await cellar(api);
    const four = await group(api, cellarId, 4);
    for (let column = 1; column <= 4; column++) expect((await place(api, four.id, column, 1)).status()).toBe(201);

    const bulk = await api.post('/api/inventory/bulk', { data: { ids: [four.id], patch: { quantity: 3 } } });
    expect(bulk.status(), await bulk.text()).toBe(200);
    expect(cells((await unit(api, four.id)).slots)).toEqual(['1:1', '2:1', '3:1']);

    // Single cigars take one cell for the whole group.
    const made = await api.patch(`/api/products/${four.productId}`, { data: { category: 'cigar' } });
    expect(made.status(), await made.text()).toBe(200);
    expect(cells((await unit(api, four.id)).slots)).toEqual(['1:1']);
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
