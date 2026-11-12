import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    stockMovement: { findMany: vi.fn() },
    product: { findUnique: vi.fn(async () => ({ id: 'p1' })) },
    user: { findMany: vi.fn() },
    cellar: { findMany: vi.fn() },
  },
}));

import { prisma } from '../../src/lib/prisma';
import {
  lineMovements, listMovements, recordMovements, stateMovement, type LineState,
} from '../../src/services/stock-movement.service';

// #848 (FEAT-110): what each write of a wine's stock tells its journal.

const bottle = (fields: Partial<LineState> = {}): LineState => ({
  quantity: 1, isOpened: false, fillLevel: null, cigarsPerBox: null, cigarsLeft: null, writtenOffAt: null,
  cellarId: 'garage', purchasePrice: 20, ...fields,
});

beforeEach(() => vi.clearAllMocks());

describe('stateMovement', () => {
  it('a bottle opened: one bottle, the stock unchanged', () => {
    expect(stateMovement(bottle(), bottle({ isOpened: true, fillLevel: 60 }))).toEqual({ kind: 'OPENED', delta: 0, count: 1 });
  });

  it('a bottle drunk, closed or opened: −1', () => {
    expect(stateMovement(bottle(), bottle({ isOpened: true, fillLevel: 0 }))).toEqual({ kind: 'CONSUMED', delta: -1, count: 1 });
    expect(stateMovement(bottle({ isOpened: true, fillLevel: 30 }), bottle({ isOpened: true, fillLevel: 0 })))
      .toEqual({ kind: 'CONSUMED', delta: -1, count: 1 });
  });

  it('a level changed on an opened bottle is no movement', () => {
    expect(stateMovement(bottle({ isOpened: true, fillLevel: 60 }), bottle({ isOpened: true, fillLevel: 30 }))).toBeNull();
    expect(stateMovement(bottle(), bottle())).toBeNull();
  });

  it('a bottle put back closed and full, from opened or finished', () => {
    expect(stateMovement(bottle({ isOpened: true, fillLevel: 60 }), bottle())).toEqual({ kind: 'PUT_BACK', delta: 0, count: 1 });
    expect(stateMovement(bottle({ isOpened: true, fillLevel: 0 }), bottle())).toEqual({ kind: 'PUT_BACK', delta: 1, count: 1 });
  });

  it('a finished bottle set back to opened: +1', () => {
    expect(stateMovement(bottle({ isOpened: true, fillLevel: 0 }), bottle({ isOpened: true, fillLevel: 20 })))
      .toEqual({ kind: 'UNFINISHED', delta: 1, count: 1 });
  });

  it('cigars: the first of a closed box smoked opens it (−1), the next ones too, the last finishes it', () => {
    const box = { cigarsPerBox: 25 };
    expect(stateMovement(bottle(box), bottle({ ...box, isOpened: true, cigarsLeft: 24 }))).toEqual({ kind: 'CONSUMED', delta: -1, count: 1 });
    expect(stateMovement(bottle({ ...box, isOpened: true, cigarsLeft: 24 }), bottle({ ...box, isOpened: true, cigarsLeft: 23 })))
      .toEqual({ kind: 'CONSUMED', delta: -1, count: 1 });
    expect(stateMovement(bottle({ ...box, isOpened: true, cigarsLeft: 3 }), bottle({ ...box, isOpened: true, fillLevel: 0, cigarsLeft: 0 })))
      .toEqual({ kind: 'CONSUMED', delta: -3, count: 3 });
    // Opened without smoking: the box is opened, its cigars all there.
    expect(stateMovement(bottle(box), bottle({ ...box, isOpened: true, cigarsLeft: 25 }))).toEqual({ kind: 'OPENED', delta: 0, count: 1 });
  });

  it('a count of cigars left raised on an opened box: a correction', () => {
    expect(stateMovement(bottle({ cigarsPerBox: 25, isOpened: true, cigarsLeft: 10 }), bottle({ cigarsPerBox: 25, isOpened: true, cigarsLeft: 12 })))
      .toEqual({ kind: 'CORRECTED', delta: 2, count: 2 });
  });
});

describe('lineMovements', () => {
  it('a whole line moved to another cellar', () => {
    expect(lineMovements(bottle({ quantity: 6 }), bottle({ quantity: 6, cellarId: 'kitchen' }))).toEqual([
      { kind: 'MOVED', delta: 0, count: 6, details: { cellarId: 'garage', fromCellarId: 'garage', toCellarId: 'kitchen' } },
    ]);
  });

  it('a new price for a whole line', () => {
    expect(lineMovements(bottle({ quantity: 2 }), bottle({ quantity: 2, purchasePrice: 25 }))).toEqual([
      { kind: 'PRICE_CHANGED', delta: 0, count: 2, details: { cellarId: 'garage', fromPrice: 20, toPrice: 25 } },
    ]);
  });

  it('a number raised adds bottles; lowered, corrects it (no reason given)', () => {
    expect(lineMovements(bottle({ quantity: 4 }), bottle({ quantity: 6 }))).toEqual([
      { kind: 'ADDED', delta: 2, count: 2, details: { cellarId: 'garage' } },
    ]);
    expect(lineMovements(bottle({ quantity: 4 }), bottle({ quantity: 3 }))).toEqual([
      { kind: 'CORRECTED', delta: -1, count: 1, details: { cellarId: 'garage', from: 4, to: 3 } },
    ]);
  });

  it('boxes of cigars count their cigars', () => {
    expect(lineMovements(bottle({ quantity: 1, cigarsPerBox: 25 }), bottle({ quantity: 2, cigarsPerBox: 25 }))).toEqual([
      { kind: 'ADDED', delta: 25, count: 1, details: { cellarId: 'garage' } },
    ]);
  });

  // Review of #982 (remark 2): a written-off or finished line holds nothing: moving it moves no stock.
  it('a line holding nothing in stock tells no movement', () => {
    const gone = new Date('2026-11-01T00:00:00Z');
    expect(lineMovements(bottle({ quantity: 2, writtenOffAt: gone }), bottle({ quantity: 2, writtenOffAt: gone, cellarId: 'kitchen', purchasePrice: 25 }))).toEqual([]);
    expect(lineMovements(bottle({ isOpened: true, fillLevel: 0 }), bottle({ isOpened: true, fillLevel: 0, cellarId: 'kitchen' }))).toEqual([]);
  });

  it('nothing changed of the line: no movement', () => {
    expect(lineMovements(bottle({ quantity: 6 }), bottle({ quantity: 6 }))).toEqual([]);
  });
});

describe('recordMovements', () => {
  it('writes a member\'s movements in the transaction given', async () => {
    const tx = { stockMovement: { createMany: vi.fn(async () => ({ count: 1 })) } };

    await recordMovements(tx as never, { userId: 'marie' }, [
      { productId: 'p1', itemId: 'b1', kind: 'ADDED', delta: 6, count: 6, details: { cellarId: 'garage' } },
    ]);

    expect(tx.stockMovement.createMany).toHaveBeenCalledWith({
      data: [{ productId: 'p1', itemId: 'b1', kind: 'ADDED', delta: 6, count: 6, details: { cellarId: 'garage' }, userId: 'marie', guestName: null }],
    });
  });

  it('a guest\'s movement names the guest, never the member who shared the cellar', async () => {
    const tx = { stockMovement: { createMany: vi.fn(async () => ({ count: 1 })) } };

    await recordMovements(tx as never, { userId: 'owner', guest: { name: null } }, [
      { productId: 'p1', itemId: 'b2', kind: 'CONSUMED', delta: -1, count: 1 },
    ]);

    expect(tx.stockMovement.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ userId: null, guestName: '' })],
    });
  });

  it('writes nothing for no movement', async () => {
    const tx = { stockMovement: { createMany: vi.fn() } };

    await recordMovements(tx as never, { userId: 'marie' }, []);

    expect(tx.stockMovement.createMany).not.toHaveBeenCalled();
  });
});

describe('listMovements', () => {
  it('is null for an unknown wine', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValueOnce(null);

    expect(await listMovements('nope')).toBeNull();
    expect(prisma.stockMovement.findMany).not.toHaveBeenCalled();
  });

  const row = (fields: Record<string, unknown>) => ({
    id: 1, productId: 'p1', itemId: 'b1', kind: 'ADDED', delta: 6, count: 6, details: { cellarId: 'garage' },
    userId: 'marie', guestName: null, createdAt: new Date('2026-11-12T10:00:00Z'), ...fields,
  });

  it('newest first, with the author and the cellars named', async () => {
    vi.mocked(prisma.stockMovement.findMany).mockResolvedValue([
      row({ id: 3, kind: 'MOVED', delta: 0, count: 2, details: { cellarId: 'garage', fromCellarId: 'garage', toCellarId: 'kitchen' } }),
      row({ id: 2, userId: null, guestName: 'Paul', kind: 'CONSUMED', delta: -1, count: 1, details: { cellarId: null } }),
      row({ id: 1, userId: null, kind: 'INITIAL', delta: 9, count: 9, details: null, itemId: null }),
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'marie', username: 'marie', displayName: 'Marie' }] as never);
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([{ id: 'garage', name: 'Garage' }, { id: 'kitchen', name: 'Cuisine' }] as never);

    const lines = (await listMovements('p1'))!;

    expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { productId: 'p1' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }));
    expect(lines.map((line) => line.id)).toEqual(['3', '2', '1']);
    expect(lines[0]).toMatchObject({
      kind: 'MOVED', count: 2, author: { kind: 'member', name: 'Marie' },
      cellar: { id: 'garage', name: 'Garage' }, fromCellar: { id: 'garage', name: 'Garage' }, toCellar: { id: 'kitchen', name: 'Cuisine' },
    });
    expect(lines[1]).toMatchObject({ kind: 'CONSUMED', delta: -1, author: { kind: 'guest', name: 'Paul' }, cellar: null });
    expect(lines[2]).toMatchObject({ kind: 'INITIAL', delta: 9, author: { kind: 'none' }, itemId: null });
  });

  it('#661: a deleted or anonymised member is shown as such, never by a former name', async () => {
    vi.mocked(prisma.stockMovement.findMany).mockResolvedValue([
      row({ id: 2, userId: null }),
      row({ id: 1, userId: 'gone' }),
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'gone', username: 'deleted-gone', displayName: null }] as never);
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([] as never);

    const lines = (await listMovements('p1'))!;

    expect(lines.map((line) => line.author)).toEqual([{ kind: 'deletedMember' }, { kind: 'deletedMember' }]);
    // A cellar deleted since: still told, without a name.
    expect(lines[0].cellar).toEqual({ id: 'garage', name: null });
  });
});
