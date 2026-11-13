import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    inventoryItem: { findFirst: vi.fn() },
    itemSlot: {},
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

import { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';
import { slotService } from '../../src/services/slot.service';
import { AppError } from '../../src/lib/errors';
import { fakeSlots, slot } from '../support/fake-slots';

// FEAT-93 (#847): the gestures of the cellar plan — place, move, take out,
// swap — against an in-memory `item_slots`, with the typed errors the plan
// shows ("Les 6 bouteilles de cette ligne sont déjà rangées.").

type Unit = Record<string, unknown> & { id: string };

let units: Unit[];
let slots: ReturnType<typeof fakeSlots>;

function unit(fields: Partial<Unit> & { id: string }): Unit {
  return {
    productId: 'p1', cellarId: 'c1', quantity: 6, isOpened: false, fillLevel: null, cigarsPerBox: null, cigarsLeft: null,
    writtenOffAt: null, deletedAt: null, category: 'wine',
    ...fields,
  };
}

async function rejection(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(() => null, (err: unknown) => err);
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

beforeEach(() => {
  vi.clearAllMocks();
  units = [unit({ id: 'g' })];
  slots = fakeSlots();
  Object.assign(prisma, { itemSlot: slots.delegate });
  vi.mocked(prisma.$transaction).mockImplementation(((callback: (tx: unknown) => unknown) => callback(prisma)) as never);
  // #852: the grid is read with its row locked (FOR SHARE); the family lock answers nothing.
  vi.mocked(prisma.$queryRaw).mockImplementation(((strings: TemplateStringsArray, ...values: unknown[]) => {
    if (!strings.join('?').includes('"cellars"')) return Promise.resolve([]);
    return Promise.resolve([values[0] === 'shelf' ? { columns: null, rows: null } : { columns: 6, rows: 4 }]);
  }) as never);
  vi.mocked(prisma.inventoryItem.findFirst).mockImplementation(((args: { where: { id: string } }) => {
    const row = units.find((candidate) => candidate.id === args.where.id && candidate.deletedAt == null);
    if (!row) return Promise.resolve(null);
    const live = slots.rows.filter((cell) => cell.itemId === row.id && cell.deletedAt == null).length;
    return Promise.resolve({ ...row, product: { category: row.category }, _count: { slots: live } });
  }) as never);
});

describe('slotService.place (POST /api/inventory/:id/slots)', () => {
  it('c1: a group x6 placed copy by copy fills 6 cells, and says what the history records', async () => {
    for (let column = 1; column <= 6; column++) {
      const write = await slotService.place('g', { column, row: 1 });
      expect(write).toMatchObject({ itemId: 'g', productId: 'p1', slot: { column, row: 1 }, change: { field: 'slot', from: null, to: { column, row: 1 } } });
    }
    expect(slots.cellsOf('g')).toBe('1:1 2:1 3:1 4:1 5:1 6:1');
    // The family is locked before the cell is written (locking rule).
    expect(vi.mocked(prisma.$queryRaw).mock.invocationCallOrder[0]).toBeLessThan(slots.delegate.create.mock.invocationCallOrder[0]);
  });

  it('c2: a 7th copy of a group x6 is refused, with the numbers to explain it', async () => {
    slots.rows.push(...[1, 2, 3, 4, 5, 6].map((column) => slot({ itemId: 'g', column, row: 1 })));

    const error = await rejection(slotService.place('g', { column: 1, row: 2 }));

    expect(error).toMatchObject({ status: 409, code: 'NO_UNPLACED_COPY', details: { quantity: 6, placed: 6 } });
    expect(slots.delegate.create).not.toHaveBeenCalled();
  });

  it('a group of single cigars takes one cell for the group', async () => {
    units = [unit({ id: 'g', quantity: 10, category: 'cigar' })];
    await slotService.place('g', { column: 1, row: 1 });

    expect(await rejection(slotService.place('g', { column: 2, row: 1 }))).toMatchObject({ code: 'NO_UNPLACED_COPY', details: { quantity: 1, placed: 1 } });
  });

  it('refuses a cell already held, before writing', async () => {
    units.push(unit({ id: 'other', productId: 'p2' }));
    slots.rows.push(slot({ itemId: 'other', column: 3, row: 2 }));

    expect(await rejection(slotService.place('g', { column: 3, row: 2 }))).toMatchObject({ status: 409, code: 'SLOT_OCCUPIED' });
    expect(slots.delegate.create).not.toHaveBeenCalled();
  });

  it('a cell held by a copy in the trash is free (#174)', async () => {
    slots.rows.push(slot({ itemId: 'trashed', column: 3, row: 2, deletedAt: new Date() }));

    await slotService.place('g', { column: 3, row: 2 });

    expect(slots.cellsOf('g')).toBe('3:2');
  });

  it('a cell taken in the instant since the check (P2002 on the live-cell index) answers the same 409', async () => {
    slots.delegate.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }));

    expect(await rejection(slotService.place('g', { column: 1, row: 1 }))).toMatchObject({ status: 409, code: 'SLOT_OCCUPIED' });
  });

  it('only a unit in stock, in a cellar with a grid, within the grid', async () => {
    units = [
      unit({ id: 'finished', quantity: 1, isOpened: true, fillLevel: 0 }),
      unit({ id: 'off', writtenOffAt: new Date() }),
      unit({ id: 'nowhere', cellarId: null }),
      unit({ id: 'shelved', cellarId: 'shelf' }),
      unit({ id: 'g' }),
    ];

    expect(await rejection(slotService.place('finished', { column: 1, row: 1 }))).toMatchObject({ status: 409, code: 'NOT_IN_STOCK' });
    expect(await rejection(slotService.place('off', { column: 1, row: 1 }))).toMatchObject({ status: 409, code: 'NOT_IN_STOCK' });
    expect(await rejection(slotService.place('nowhere', { column: 1, row: 1 }))).toMatchObject({ status: 400, code: 'NO_CELLAR' });
    expect(await rejection(slotService.place('shelved', { column: 1, row: 1 }))).toMatchObject({ status: 400, code: 'OUTSIDE_GRID' });
    expect(await rejection(slotService.place('g', { column: 7, row: 1 }))).toMatchObject({ status: 400, code: 'OUTSIDE_GRID' });
    expect(await rejection(slotService.place('g', { column: 1, row: 5 }))).toMatchObject({ status: 400, code: 'OUTSIDE_GRID' });
    expect(await rejection(slotService.place('gone', { column: 1, row: 1 }))).toMatchObject({ status: 404, code: 'ITEM_NOT_FOUND' });
    expect(slots.delegate.create).not.toHaveBeenCalled();
  });

  // #852: a grid made smaller meanwhile (cellar row locked FOR UPDATE) waits
  // for this placement, or this placement for it — never a copy outside.
  it('reads the grid with the cellar row locked against a resize, in its transaction', async () => {
    await slotService.place('g', { column: 1, row: 1 });
    const gridRead = vi.mocked(prisma.$queryRaw).mock.calls
      .map(([strings]) => (strings as unknown as string[]).join('?'))
      .find((sql) => sql.includes('"cellars"'));
    expect(gridRead).toMatch(/FOR SHARE/);
  });
});

describe('slotService.move / remove (PATCH, DELETE /api/slots/:slotId)', () => {
  beforeEach(() => {
    slots.rows.push(slot({ id: 's1', itemId: 'g', column: 1, row: 1 }), slot({ id: 's2', itemId: 'other', column: 2, row: 1 }));
  });

  it('moves a copy to a free cell of the same cellar, and says from where to where', async () => {
    const write = await slotService.move('s1', { column: 5, row: 4 });

    expect(slots.cellsOf('g')).toBe('5:4');
    expect(write.change).toEqual({ field: 'slot', from: { column: 1, row: 1 }, to: { column: 5, row: 4 } });
  });

  it('refuses a held cell, a cell outside the grid and a slot that is gone', async () => {
    expect(await rejection(slotService.move('s1', { column: 2, row: 1 }))).toMatchObject({ status: 409, code: 'SLOT_OCCUPIED' });
    expect(await rejection(slotService.move('s1', { column: 9, row: 1 }))).toMatchObject({ status: 400, code: 'OUTSIDE_GRID' });
    expect(await rejection(slotService.move('nope', { column: 3, row: 1 }))).toMatchObject({ status: 404, code: 'SLOT_NOT_FOUND' });
    expect(slots.cellsOf('g')).toBe('1:1');
  });

  it('takes a copy out of its cell: it stays in stock, unplaced', async () => {
    const write = await slotService.remove('s1');

    expect(slots.cellsOf('g')).toBe('');
    expect(write.change).toEqual({ field: 'slot', from: { column: 1, row: 1 }, to: null });
    expect(await rejection(slotService.remove('s1'))).toMatchObject({ status: 404, code: 'SLOT_NOT_FOUND' });
  });
});

describe('slotService.swap (POST /api/cellars/:id/swap-slots, ISSUE_037)', () => {
  it('two copies exchange their cells by exchanging their units: no cell is held twice', async () => {
    slots.rows.push(slot({ id: 'sa', itemId: 'a', column: 1, row: 1 }), slot({ id: 'sb', itemId: 'b', column: 2, row: 1 }));

    const [a, b] = await slotService.swap('c1', 'sa', 'sb');

    expect(slots.cellsOf('a')).toBe('2:1');
    expect(slots.cellsOf('b')).toBe('1:1');
    // The cells never move: only `itemId` changes, so the unique index is never touched.
    expect(slots.delegate.update.mock.calls.map((call) => call[0].data)).toEqual([{ itemId: 'b' }, { itemId: 'a' }]);
    expect(a.change).toEqual({ field: 'slot', from: { column: 1, row: 1 }, to: { column: 2, row: 1 } });
    expect(b.change).toEqual({ field: 'slot', from: { column: 2, row: 1 }, to: { column: 1, row: 1 } });
  });

  it('refuses two cells of the same line: nothing written, nothing for the history', async () => {
    slots.rows.push(slot({ id: 'sa', itemId: 'g', column: 1, row: 1 }), slot({ id: 'sb', itemId: 'g', column: 2, row: 1 }));

    expect(await rejection(slotService.swap('c1', 'sa', 'sb'))).toMatchObject({ status: 400, code: 'SAME_LINE_SLOTS' });
    expect(slots.delegate.update).not.toHaveBeenCalled();
    expect(slots.cellsOf('g')).toBe('1:1 2:1');
  });

  it('refuses slots of another cellar, or gone', async () => {
    slots.rows.push(slot({ id: 'sa', itemId: 'a', column: 1, row: 1 }), slot({ id: 'sb', itemId: 'b', cellarId: 'c2', column: 2, row: 1 }));

    expect(await rejection(slotService.swap('c1', 'sa', 'sb'))).toMatchObject({ status: 404, code: 'SLOT_NOT_FOUND' });
    expect(await rejection(slotService.swap('c1', 'sa', 'nope'))).toMatchObject({ status: 404, code: 'SLOT_NOT_FOUND' });
    expect(slots.delegate.update).not.toHaveBeenCalled();
  });
});
