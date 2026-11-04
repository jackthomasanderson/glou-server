import { describe, it, expect, beforeEach, vi } from 'vitest';

// #471 (FEAT-100): the rotating inventory counts a group in one answer —
// "Combien en avez-vous trouvé ?" — and corrects only its missing (or
// surplus) copies through the stock rules of K (finishUnits) and A2
// (addUnits / correctQuantity), which are tested on their own.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    inventoryCountSession: { findUnique: vi.fn() },
    inventoryItem: { findMany: vi.fn() },
    inventoryCountEntry: { findMany: vi.fn(), upsert: vi.fn() },
    product: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('../../src/lib/product-fields', async () => ({
  lockFamilies: vi.fn(),
  compareFamilyIds: (await vi.importActual<typeof import('../../src/lib/product-fields')>('../../src/lib/product-fields')).compareFamilyIds,
}));
vi.mock('../../src/services/stock-state.service', () => ({ finishUnits: vi.fn() }));
vi.mock('../../src/services/stock.service', () => ({ addUnitsIn: vi.fn(), correctQuantityIn: vi.fn() }));
vi.mock('../../src/services/inventory.service', () => ({ inventoryService: { createItem: vi.fn() } }));

import { prisma } from '../../src/lib/prisma';
import { compareFamilyIds, lockFamilies } from '../../src/lib/product-fields';
import { finishUnits } from '../../src/services/stock-state.service';
import { addUnitsIn, correctQuantityIn } from '../../src/services/stock.service';
import { inventoryService } from '../../src/services/inventory.service';
import { applyCorrections, completeSession, countLine, getSessionReport, recordScan } from '../../src/services/inventory-count.service';

const SESSION = { id: 's1', cellarId: 'c1', status: 'active', scopeLabel: 'Cave', userId: 'u1', startedAt: new Date(), pausedAt: null, completedAt: null };

/** An intact group of `quantity` bottles in cellar c1. */
function group(id: string, quantity: number, extra: Record<string, unknown> = {}) {
  return {
    id, productId: `p-${id}`, name: `Wine ${id}`, producer: 'Domaine', category: 'wine', vintage: 2015, photoUrl: null,
    cellarId: 'c1', quantity, isOpened: false, fillLevel: null, cigarsLeft: null, cigarsPerBox: null,
    purchasePrice: 20, purchasedAt: new Date('2024-01-15T00:00:00.000Z'), bottleSize: '75cl', isOwned: true,
    deletedAt: null, writtenOffAt: null, ...extra,
  };
}

const opened = (id: string) => group(id, 1, { isOpened: true, fillLevel: 60 });

/** A fake transaction: the units by id, the count entries, and every write recorded in order. */
function fakeTx(units: ReturnType<typeof group>[], entries: { itemId: string; status: string; foundQuantity: number | null }[] = []) {
  const calls: string[] = [];
  vi.mocked(lockFamilies).mockImplementation(async (_tx, productIds) => {
    for (const productId of [...new Set(productIds)].sort(compareFamilyIds)) calls.push(`lock:${productId}`);
  });
  // The count entries of the finds, as stored (moveCountEntry reads and writes them).
  const store: Record<string, unknown>[] = [];
  vi.mocked(finishUnits).mockImplementation(async (_tx, itemId, count) => {
    calls.push(`finish:${itemId}x${count}`);
    return Array.from({ length: count }, (_, i) => (i === 0 ? `${itemId}-sub` : `${itemId}-sub${i}`));
  });
  vi.mocked(addUnitsIn).mockImplementation(async (_tx, _user, productId, input) => {
    calls.push(`add:${productId}x${input.quantity}`);
    return { result: { data: { id: 'g-added' } as never, changed: [], removedIds: [] }, merged: true, from: 6, to: 6 + input.quantity };
  });
  vi.mocked(correctQuantityIn).mockImplementation(async (_tx, _user, itemId, productId, input) => {
    calls.push(`correct:${itemId}->${input.quantity}:${input.reason}`);
    return { result: { data: {} as never, changed: [], removedIds: [] }, productId, changes: [{ field: 'quantity', from: 6, to: input.quantity }], writtenOffItemId: 'w1' };
  });
  const tx = {
    inventoryItem: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        units.filter((unit) => where.id.in.includes(unit.id)).map((unit) => ({ productId: unit.productId }))),
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => units.find((unit) => unit.id === where.id) ?? null),
      update: vi.fn(),
    },
    inventoryCountEntry: {
      findMany: vi.fn(async () => entries),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => store.find((entry) => entry.id === where.id) ?? null),
      findFirst: vi.fn(async ({ where }: { where: { sessionId: string; itemId: string; id: { not: string } } }) =>
        store.find((entry) => entry.sessionId === where.sessionId && entry.itemId === where.itemId && entry.id !== where.id.not) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Object.assign(store.find((entry) => entry.id === where.id) ?? {}, data)),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => store.splice(store.findIndex((entry) => entry.id === where.id), 1)),
    },
    inventoryCountSession: { updateMany: vi.fn(async () => ({ count: 1 })), findUniqueOrThrow: vi.fn(async () => ({ ...SESSION, status: 'completed' })) },
    product: { findFirst: vi.fn() },
  };
  vi.mocked(prisma.$transaction).mockImplementation(((callback: (client: unknown) => unknown) => callback(tx)) as never);
  vi.mocked(prisma.inventoryCountSession.findUnique).mockResolvedValue(SESSION as never);
  return { tx, calls, store };
}

beforeEach(() => vi.clearAllMocks());

describe('countLine — the numbers of one line (D15)', () => {
  it('expects the whole group while it is not pointed', () => {
    expect(countLine(group('g1', 6) as never, undefined)).toMatchObject({
      isGroup: true, expectedQuantity: 6, foundQuantity: null, missingQuantity: 6, surplusQuantity: 0,
    });
  });

  it('reads the number found: 4 of 6 leaves 2 missing', () => {
    expect(countLine(group('g1', 6) as never, { foundQuantity: 4 })).toMatchObject({
      foundQuantity: 4, missingQuantity: 2, surplusQuantity: 0,
    });
  });

  it('reads a surplus: 8 of 6 is 2 more', () => {
    expect(countLine(group('g1', 6) as never, { foundQuantity: 8 })).toMatchObject({
      foundQuantity: 8, missingQuantity: 0, surplusQuantity: 2,
    });
  });

  it('takes a confirmation without number as the whole line (one tap, or a count started before #471)', () => {
    expect(countLine(group('g1', 6) as never, { foundQuantity: null })).toMatchObject({
      foundQuantity: 6, missingQuantity: 0,
    });
  });

  it('reads the number left by the families transformation on a merged group (F3)', () => {
    expect(countLine(group('g1', 3) as never, { foundQuantity: 2 })).toMatchObject({
      expectedQuantity: 3, foundQuantity: 2, missingQuantity: 1,
    });
  });

  it('counts an opened bottle on its own, never as a group', () => {
    expect(countLine(opened('o1') as never, undefined)).toMatchObject({ isGroup: false, expectedQuantity: 1, missingQuantity: 1 });
  });

  it('never reports missing a line found elsewhere (an unexpected entry)', () => {
    expect(countLine(group('g1', 6) as never, { foundQuantity: null })).toMatchObject({ foundQuantity: 6, missingQuantity: 0 });
  });
});

describe('getSessionReport — one line per group (FEAT-100 c1)', () => {
  it('lists a group ×6 on a single line, and counts copies, not lines', async () => {
    vi.mocked(prisma.inventoryCountSession.findUnique).mockResolvedValue(SESSION as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([group('g1', 6), opened('o1')] as never);
    vi.mocked(prisma.inventoryCountEntry.findMany).mockResolvedValue([] as never);

    const report = await getSessionReport('s1');

    expect(report!.expected.map((line) => [line.id, line.expectedQuantity, line.isGroup])).toEqual([['g1', 6, true], ['o1', 1, false]]);
    expect(report!.counts).toEqual({ expected: 7, confirmed: 0, missing: 7, surplus: 0, unexpected: 0 });
  });

  it('reports 2 missing of a group answered 4, and 2 more of one answered 8 (c2, c3)', async () => {
    vi.mocked(prisma.inventoryCountSession.findUnique).mockResolvedValue(SESSION as never);
    const g1 = group('g1', 6);
    const g2 = group('g2', 6);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([g1, g2] as never);
    vi.mocked(prisma.inventoryCountEntry.findMany).mockResolvedValue([
      { id: 'e1', itemId: 'g1', status: 'confirmed', foundQuantity: 4, item: g1, scannedAt: new Date() },
      { id: 'e2', itemId: 'g2', status: 'confirmed', foundQuantity: 8, item: g2, scannedAt: new Date() },
    ] as never);

    const report = await getSessionReport('s1');

    expect(report!.missing.map((line) => [line.id, line.missingQuantity])).toEqual([['g1', 2]]);
    expect(report!.surplus.map((line) => [line.id, line.surplusQuantity])).toEqual([['g2', 2]]);
    expect(report!.counts).toEqual({ expected: 12, confirmed: 10, missing: 2, surplus: 2, unexpected: 0 });
  });

  it('does not list a group answered 0 as confirmed', async () => {
    vi.mocked(prisma.inventoryCountSession.findUnique).mockResolvedValue(SESSION as never);
    const g1 = group('g1', 6);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([g1] as never);
    vi.mocked(prisma.inventoryCountEntry.findMany).mockResolvedValue([
      { id: 'e1', itemId: 'g1', status: 'confirmed', foundQuantity: 0, item: g1, scannedAt: new Date() },
    ] as never);

    const report = await getSessionReport('s1');

    expect(report!.confirmed).toEqual([]);
    expect(report!.missing[0].missingQuantity).toBe(6);
  });

  it('proposes the known wines of the same category and name for a find', async () => {
    vi.mocked(prisma.inventoryCountSession.findUnique).mockResolvedValue(SESSION as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.inventoryCountEntry.findMany).mockResolvedValue([
      { id: 'f1', itemId: null, item: null, status: 'unexpected', newItemName: ' château talbot ', newItemCategory: 'wine', newItemQuantity: 6, foundQuantity: null, scannedAt: new Date() },
    ] as never);
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: 'p1', name: 'Château Talbot', producer: 'Talbot', vintage: 2015, category: 'wine' },
    ] as never);

    const report = await getSessionReport('s1');

    expect(report!.unexpected[0]).toMatchObject({ quantity: 6, matchingProducts: [{ id: 'p1', name: 'Château Talbot', producer: 'Talbot', vintage: 2015 }] });
    const where = vi.mocked(prisma.product.findMany).mock.calls[0][0]!.where as { AND: { OR: unknown[] }[]; deletedAt: null };
    expect(where.deletedAt).toBeNull();
    expect(where.AND[0].OR).toEqual([{ category: 'wine', name: { equals: 'château talbot', mode: 'insensitive' } }]);
  });
});

describe('recordScan — "Combien en avez-vous trouvé ?"', () => {
  it('stores the number found on the entry of the group', async () => {
    vi.mocked(prisma.inventoryCountSession.findUnique).mockResolvedValue(SESSION as never);
    (prisma.inventoryItem as unknown as { findFirst: unknown }).findFirst = vi.fn().mockResolvedValue(group('g1', 6));
    vi.mocked(prisma.inventoryCountEntry.upsert).mockResolvedValue({ id: 'e1', itemId: 'g1', status: 'confirmed', scannedAt: new Date() } as never);

    await recordScan('s1', 'g1', 4);

    expect(prisma.inventoryCountEntry.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ foundQuantity: 4, status: 'confirmed' }),
      update: expect.objectContaining({ foundQuantity: 4 }),
    }));
  });

  it('records a one-tap confirmation as the whole line (no number)', async () => {
    vi.mocked(prisma.inventoryCountSession.findUnique).mockResolvedValue(SESSION as never);
    (prisma.inventoryItem as unknown as { findFirst: unknown }).findFirst = vi.fn().mockResolvedValue(group('g1', 6));
    vi.mocked(prisma.inventoryCountEntry.upsert).mockResolvedValue({ id: 'e1', itemId: 'g1', status: 'confirmed', scannedAt: new Date() } as never);

    await recordScan('s1', 'g1');

    expect(prisma.inventoryCountEntry.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ foundQuantity: null }),
    }));
  });
});

describe('applyCorrections — the missing copies of a group (FEAT-100 c2)', () => {
  it('marks only the 2 missing bottles of a ×6 answered 4 as drunk, and logs −2 on the group', async () => {
    const { calls } = fakeTx([group('g1', 6)], [{ itemId: 'g1', status: 'confirmed', foundQuantity: 4 }]);

    const result = await applyCorrections('s1', [{ action: 'mark_consumed', itemId: 'g1' }], 'u1');

    expect(result).toMatchObject({ status: 'success', appliedCount: 1, skipped: [] });
    expect(calls).toEqual(['lock:p-g1', 'finish:g1x2']);
    if (result.status !== 'success') throw new Error('unreachable');
    expect(result.history[0]).toEqual({
      action: 'UPDATE', itemId: 'g1', productId: 'p-g1',
      details: { scope: 'inventory-count', sessionId: 's1', changes: [{ field: 'quantity', from: 6, to: 4 }], finishedItemIds: ['g1-sub', 'g1-sub1'] },
    });
    expect(result.history.slice(1).map((entry) => [entry.itemId, entry.details.outcome])).toEqual([['g1-sub', 'detached'], ['g1-sub1', 'detached']]);
  });

  it('finishes a whole group that was not found at all', async () => {
    const { calls } = fakeTx([group('g1', 3)]);

    await applyCorrections('s1', [{ action: 'mark_consumed', itemId: 'g1' }], 'u1');

    expect(calls).toEqual(['lock:p-g1', 'finish:g1x3']);
  });

  it('takes a count chosen by the member, never more than the line holds', async () => {
    const { calls } = fakeTx([group('g1', 6)], [{ itemId: 'g1', status: 'confirmed', foundQuantity: 4 }]);

    await applyCorrections('s1', [{ action: 'mark_consumed', itemId: 'g1', count: 1 }, { action: 'mark_consumed', itemId: 'g1', count: 50 }], 'u1');

    expect(calls).toEqual(['lock:p-g1', 'finish:g1x1', 'finish:g1x6']);
  });

  it('skips a bottle already finished: no history "1 → 1"', async () => {
    fakeTx([group('g1', 1, { isOpened: true, fillLevel: 0 })]);

    const result = await applyCorrections('s1', [{ action: 'mark_consumed', itemId: 'g1' }], 'u1');

    expect(result).toMatchObject({ appliedCount: 0, skipped: [{ reason: 'nothing_to_correct' }], history: [] });
    expect(finishUnits).not.toHaveBeenCalled();
  });

  it('skips a line with nothing missing', async () => {
    fakeTx([group('g1', 6)], [{ itemId: 'g1', status: 'confirmed', foundQuantity: 6 }]);

    const result = await applyCorrections('s1', [{ action: 'mark_consumed', itemId: 'g1' }], 'u1');

    expect(result).toMatchObject({ appliedCount: 0, skipped: [{ targetId: 'g1', action: 'mark_consumed', reason: 'nothing_to_correct' }] });
    expect(finishUnits).not.toHaveBeenCalled();
  });

  it('corrects the number of a ×6 answered 4 to 4, broken / given away / lost', async () => {
    const { calls } = fakeTx([group('g1', 6)], [{ itemId: 'g1', status: 'confirmed', foundQuantity: 4 }]);

    const result = await applyCorrections('s1', [{ action: 'correct_quantity', itemId: 'g1', reason: 'written_off' }], 'u1');

    expect(calls).toEqual(['lock:p-g1', 'correct:g1->4:written_off']);
    expect(finishUnits).not.toHaveBeenCalled();
    if (result.status !== 'success') throw new Error('unreachable');
    expect(result.history).toEqual([{
      action: 'CORRECT_QUANTITY', itemId: 'g1', productId: 'p-g1',
      details: { scope: 'inventory-count', sessionId: 's1', reason: 'written_off', changes: [{ field: 'quantity', from: 6, to: 4 }], writtenOffItemId: 'w1' },
    }]);
  });

  it('writes off a whole group not found (broken / given away / lost to 0)', async () => {
    const { calls } = fakeTx([group('g1', 2)]);

    await applyCorrections('s1', [{ action: 'correct_quantity', itemId: 'g1', reason: 'written_off' }], 'u1');

    expect(calls).toEqual(['lock:p-g1', 'correct:g1->0:written_off']);
  });

  it('never takes a group below one for an input error (the trash is for the whole line)', async () => {
    fakeTx([group('g1', 2)]);

    const result = await applyCorrections('s1', [{ action: 'correct_quantity', itemId: 'g1', reason: 'input_error' }], 'u1');

    expect(result).toMatchObject({ appliedCount: 0, skipped: [{ targetId: 'g1', reason: 'nothing_to_correct' }] });
    expect(correctQuantityIn).not.toHaveBeenCalled();
  });

  it('refuses to correct the number of an opened bottle (it has none)', async () => {
    fakeTx([opened('o1')]);

    const result = await applyCorrections('s1', [{ action: 'correct_quantity', itemId: 'o1', reason: 'written_off' }], 'u1');

    expect(result).toMatchObject({ appliedCount: 0, skipped: [{ targetId: 'o1', reason: 'not_a_group' }] });
  });
});

describe('applyCorrections — surplus and finds (FEAT-100 c3, c4)', () => {
  it('adds the 2 bottles found in excess to the group (same cellar, price, size, purchase day)', async () => {
    const { calls } = fakeTx([group('g1', 6)], [{ itemId: 'g1', status: 'confirmed', foundQuantity: 8 }]);

    const result = await applyCorrections('s1', [{ action: 'add_units', itemId: 'g1' }], 'u1');

    expect(calls).toEqual(['lock:p-g1', 'add:p-g1x2']);
    expect(addUnitsIn).toHaveBeenCalledWith(expect.anything(), 'u1', 'p-g1', {
      quantity: 2, cellarId: 'c1', purchasePrice: 20, purchasedAt: '2024-01-15', bottleSize: '75cl', cigarsPerBox: null,
    });
    if (result.status !== 'success') throw new Error('unreachable');
    expect(result.history[0]).toMatchObject({ action: 'ADD_UNITS', details: { changes: [{ field: 'quantity', from: 6, to: 8 }] } });
  });

  it('skips a surplus correction when nothing was found in excess', async () => {
    fakeTx([group('g1', 6)], [{ itemId: 'g1', status: 'confirmed', foundQuantity: 6 }]);

    const result = await applyCorrections('s1', [{ action: 'add_units', itemId: 'g1' }], 'u1');

    expect(result).toMatchObject({ skipped: [{ reason: 'nothing_to_correct' }] });
  });

  it('turns a find of 6 bottles of an unknown wine into a new card with a group ×6', async () => {
    const { tx, store } = fakeTx([]);
    store.push({ id: 'f1', sessionId: 's1', itemId: null, newItemName: 'Clos Inconnu', newItemCategory: 'wine', newItemQuantity: 6 });
    vi.mocked(inventoryService.createItem).mockResolvedValue({ id: 'new1', productId: 'pnew' } as never);

    const result = await applyCorrections('s1', [{ action: 'add_to_stock', entryId: 'f1' }], 'u1');

    expect(inventoryService.createItem).toHaveBeenCalledWith('u1', expect.objectContaining({ name: 'Clos Inconnu', category: 'wine', quantity: 6, cellarId: 'c1' }), tx);
    expect(tx.inventoryCountEntry.update).toHaveBeenCalledWith({ where: { id: 'f1' }, data: { itemId: 'new1' } });
    expect(result).toMatchObject({ appliedCount: 1 });
  });

  it('attaches a find of a known wine to its family, never a second card', async () => {
    const { tx, calls, store } = fakeTx([]);
    store.push({ id: 'f1', sessionId: 's1', itemId: null, newItemName: 'Château Talbot', newItemCategory: 'wine', newItemQuantity: 6 });
    tx.product.findFirst.mockResolvedValue({ id: 'p1', category: 'wine' });

    await applyCorrections('s1', [{ action: 'add_to_stock', entryId: 'f1', productId: 'p1' }], 'u1');

    expect(calls).toEqual(['lock:p1', 'add:p1x6']);
    expect(addUnitsIn).toHaveBeenCalledWith(tx, 'u1', 'p1', { quantity: 6, cellarId: 'c1', purchasedAt: null });
    expect(inventoryService.createItem).not.toHaveBeenCalled();
    // The find's entry now counts the 6 copies found on the group (not "the whole group").
    expect(store).toEqual([expect.objectContaining({ id: 'f1', itemId: 'g-added', foundQuantity: 6, status: 'confirmed' })]);
  });

  it('two finds of the same known wine add up on one entry of the group, never two (one entry per line and session)', async () => {
    const { tx, store } = fakeTx([]);
    store.push(
      { id: 'f1', sessionId: 's1', itemId: null, newItemName: 'Talbot', newItemCategory: 'wine', newItemQuantity: 3 },
      { id: 'f2', sessionId: 's1', itemId: null, newItemName: 'talbot', newItemCategory: 'wine', newItemQuantity: 2 },
    );
    tx.product.findFirst.mockResolvedValue({ id: 'p1', category: 'wine' });
    vi.mocked(addUnitsIn)
      .mockResolvedValueOnce({ result: { data: { id: 'g' } as never, changed: [], removedIds: [] }, merged: false, from: null, to: 3 })
      .mockResolvedValueOnce({ result: { data: { id: 'g' } as never, changed: [], removedIds: [] }, merged: true, from: 3, to: 5 });

    const result = await applyCorrections('s1', [
      { action: 'add_to_stock', entryId: 'f1', productId: 'p1' },
      { action: 'add_to_stock', entryId: 'f2', productId: 'p1' },
    ], 'u1');

    expect(result).toMatchObject({ appliedCount: 2, skipped: [] });
    expect(store).toEqual([expect.objectContaining({ id: 'f1', itemId: 'g', foundQuantity: 5 })]);
  });

  it('a find joining a group already counted adds its copies to the number found (null = the whole group before)', async () => {
    const { tx, store } = fakeTx([]);
    store.push(
      { id: 'e1', sessionId: 's1', itemId: 'g', foundQuantity: null, status: 'confirmed' },
      { id: 'f1', sessionId: 's1', itemId: null, newItemName: 'Talbot', newItemCategory: 'wine', newItemQuantity: 2 },
    );
    tx.product.findFirst.mockResolvedValue({ id: 'p1', category: 'wine' });
    vi.mocked(addUnitsIn).mockResolvedValueOnce({ result: { data: { id: 'g' } as never, changed: [], removedIds: [] }, merged: true, from: 6, to: 8 });

    await applyCorrections('s1', [{ action: 'add_to_stock', entryId: 'f1', productId: 'p1' }], 'u1');

    expect(store).toEqual([expect.objectContaining({ id: 'e1', itemId: 'g', foundQuantity: 8 })]);
  });

  it('refuses to put a find into a wine of another category', async () => {
    const { tx, store } = fakeTx([]);
    store.push({ id: 'f1', sessionId: 's1', itemId: null, newItemName: 'Talbot', newItemCategory: 'cigar', newItemQuantity: 2 });
    tx.product.findFirst.mockResolvedValue({ id: 'p1', category: 'wine' });

    const result = await applyCorrections('s1', [{ action: 'add_to_stock', entryId: 'f1', productId: 'p1' }], 'u1');

    expect(result).toMatchObject({ appliedCount: 0, skipped: [{ targetId: 'f1', reason: 'category_mismatch' }] });
    expect(addUnitsIn).not.toHaveBeenCalled();
  });

  it('skips a find attached to a wine that is gone (trash)', async () => {
    const { tx, store } = fakeTx([]);
    store.push({ id: 'f1', sessionId: 's1', itemId: null, newItemName: 'X', newItemCategory: 'wine', newItemQuantity: 1 });
    tx.product.findFirst.mockResolvedValue(null);

    const result = await applyCorrections('s1', [{ action: 'add_to_stock', entryId: 'f1', productId: 'gone' }], 'u1');

    expect(result).toMatchObject({ appliedCount: 0, skipped: [{ targetId: 'f1', reason: 'product_not_found' }] });
    expect(addUnitsIn).not.toHaveBeenCalled();
  });
});

describe('applyCorrections — the locking rule (#471)', () => {
  it('locks every family written, in sorted order, before any unit is written', async () => {
    const { tx, calls, store } = fakeTx(
      [group('b', 2, { productId: 'p-z' }), group('a', 2, { productId: 'p-m' })],
      [{ itemId: 'b', status: 'confirmed', foundQuantity: 1 }, { itemId: 'a', status: 'confirmed', foundQuantity: 3 }],
    );
    store.push({ id: 'f1', sessionId: 's1', itemId: null, newItemName: 'X', newItemCategory: 'wine', newItemQuantity: 1 });
    tx.product.findFirst.mockResolvedValue({ id: 'p-a', category: 'wine' });

    await applyCorrections('s1', [
      { action: 'mark_consumed', itemId: 'b' },
      { action: 'add_units', itemId: 'a' },
      { action: 'add_to_stock', entryId: 'f1', productId: 'p-a' },
    ], 'u1');

    expect(calls.slice(0, 3)).toEqual(['lock:p-a', 'lock:p-m', 'lock:p-z']);
    expect(calls.slice(3)).toEqual(['finish:bx1', 'add:p-mx1', 'add:p-ax1']);
  });
});

describe('completeSession — a closure applies once', () => {
  it('a second closure sent meanwhile finds the session completed and applies nothing', async () => {
    const { tx } = fakeTx([group('g1', 3)]);
    tx.inventoryCountSession.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await completeSession('s1', [{ action: 'mark_consumed', itemId: 'g1' }], 'u1');

    expect(result).toEqual({ status: 'already_completed' });
    expect(finishUnits).not.toHaveBeenCalled();
    expect(tx.inventoryCountSession.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', status: { not: 'completed' } }, data: { status: 'completed', completedAt: expect.any(Date) },
    });
  });

  it('takes the session before applying the corrections', async () => {
    const { tx, calls } = fakeTx([group('g1', 3)]);
    tx.inventoryCountSession.updateMany.mockImplementationOnce(async () => { calls.push('take'); return { count: 1 }; });

    const result = await completeSession('s1', [{ action: 'mark_consumed', itemId: 'g1' }], 'u1');

    expect(result).toMatchObject({ status: 'success', appliedCount: 1 });
    expect(calls).toEqual(['take', 'lock:p-g1', 'finish:g1x3']);
  });
});

// W4: the report words a cigar group in boxes or in cigars, so each line carries the box size.
describe('countLine — cigar groups', () => {
  it('keeps cigarsPerBox: a group of boxes (25) differs from single cigars (null)', () => {
    const boxes = countLine(group('b', 3, { category: 'cigar', cigarsPerBox: 25 }) as never, { foundQuantity: 5 });
    const singles = countLine(group('s', 3, { category: 'cigar' }) as never, { foundQuantity: 5 });
    expect(boxes).toMatchObject({ cigarsPerBox: 25, surplusQuantity: 2 });
    expect(singles.cigarsPerBox).toBeNull();
  });
});
