import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ZodError } from 'zod';
import { InventoryService } from '../src/services/inventory.service';
import { PRODUCT_FIELDS } from '../src/lib/product-fields';

// Mock Prisma pour tests unitaires sans DB
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    inventoryItem: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    tastingNote: { deleteMany: vi.fn(), count: vi.fn() },
    // #471 (FEAT-100): a detach during an open count adjusts its entries.
    inventoryCountEntry: { updateMany: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    inventoryCountSession: { findFirst: vi.fn() },
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

const fsUnlink = vi.fn();
const fsReaddir = vi.fn();
vi.mock('fs/promises', () => ({
  default: { unlink: (...a: unknown[]) => fsUnlink(...a), readdir: (...a: unknown[]) => fsReaddir(...a) },
  unlink: (...a: unknown[]) => fsUnlink(...a),
  readdir: (...a: unknown[]) => fsReaddir(...a),
}));

import { prisma } from '../src/lib/prisma';

/** #471: a family as Prisma returns it, every description field empty unless given. */
function family(fields: Record<string, unknown> = {}) {
  return {
    ...Object.fromEntries(PRODUCT_FIELDS.map((field) => [field, null])),
    tags: [], grapeVarieties: [], alertsPaused: false, alertStatus: 'none',
    lockedFields: [], fieldSources: null, collections: [],
    ...fields,
  };
}

/** A unit row read with its family (`include: { product }`). */
function unitRow(fields: Record<string, unknown> = {}, product: Record<string, unknown> = {}) {
  return {
    id: 'b1', userId: 'u1', productId: 'p1', lockedFields: [], fieldSources: null, deletedAt: null,
    isOpened: false, fillLevel: null, ...fields, product: family(product),
  };
}

const productUpdateData = () =>
  (vi.mocked(prisma.product.update).mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined)?.data;

describe('InventoryService', () => {
  let service: InventoryService;

  beforeEach(() => {
    service = new InventoryService();
    vi.clearAllMocks();
    // Interactive transactions run against the mocked client itself.
    vi.mocked(prisma.$transaction).mockImplementation(((callback: (tx: unknown) => unknown) => callback(prisma)) as never);
    vi.mocked(prisma.inventoryItem.update).mockImplementation(((args: { where: { id: string } }) =>
      Promise.resolve(unitRow({ id: args.where.id }))) as never);
    vi.mocked(prisma.product.findMany).mockResolvedValue([] as never);
    // #471: the unit is read again once its family is locked — here, as the test served it.
    vi.mocked(prisma.inventoryItem.findUnique).mockImplementation((async () =>
      vi.mocked(prisma.inventoryItem.findFirst).mock.results.at(0)?.value) as never);
    // #471: the family is re-read once locked, in the transaction — here, the
    // family of the unit the test just served.
    vi.mocked(prisma.product.findUniqueOrThrow).mockImplementation((async () => {
      const read = await vi.mocked(prisma.inventoryItem.findFirst).mock.results.at(0)?.value as { product?: unknown } | undefined;
      return read?.product ?? family();
    }) as never);
  });

  it('daysUntilPermanentDelete - returns 7 for a just-deleted item', () => {
    const deletedAt = new Date();
    const days = service.daysUntilPermanentDelete(deletedAt);
    expect(days).toBe(7);
  });

  it('daysUntilPermanentDelete - returns 0 for an expired deletion', () => {
    const deletedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); // 8 days ago
    const days = service.daysUntilPermanentDelete(deletedAt);
    expect(days).toBe(0);
  });

  it('daysUntilPermanentDelete - returns ~4 for half-way expired', () => {
    const deletedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
    const days = service.daysUntilPermanentDelete(deletedAt);
    expect(days).toBe(4);
  });

  it('listInventory - calls prisma with deletedAt null filter', async () => {
    const mockItems = [unitRow({ name: 'stale mirror' }, { name: 'Pétrus', collections: [{ id: 'col1' }] })];
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue(mockItems as never);

    const result = await service.listInventory('u1');

    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        product: { include: { collections: { select: { id: true, name: true, color: true, icon: true } } } },
      },
      take: 2001,
    });
    // #471: the flat record — the description and collections of the family.
    // FEAT-86: every row is decorated with a computed `readiness` (null here —
    // the mock items carry no peak-maturity window).
    expect(result.items[0]).toMatchObject({ id: 'b1', name: 'Pétrus', collections: [{ id: 'col1' }], readiness: null });
    expect(result.items[0]).not.toHaveProperty('product');
    expect(result.truncated).toBe(false);
  });

  // ISSUE_083: a ceiling with a `truncated` flag, not a silent cutoff.
  it('listInventory - flags truncated when more than 2000 items exist', async () => {
    const mockItems = Array.from({ length: 2001 }, (_, i) => unitRow({ id: `b${i}` }));
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue(mockItems as never);

    const result = await service.listInventory('u1');

    expect(result.items).toHaveLength(2000);
    expect(result.truncated).toBe(true);
  });

  it('softDelete - returns null when item not found', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(null);

    const result = await service.softDelete('u1', 'unknown-id');
    expect(result).toBeNull();
  });

  it('restore - returns null when item is past retention window', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(null);

    const result = await service.restore('u1', 'old-id');
    expect(result).toBeNull();
  });

  describe('restore - grid slot (#174)', () => {
    const trashed = unitRow({ cellarId: 'c1', slotColumn: 2, slotRow: 3, deletedAt: new Date() });

    it('restores unplaced when another bottle took the slot meanwhile', async () => {
      vi.mocked(prisma.inventoryItem.findFirst)
        .mockResolvedValueOnce(trashed as never)
        .mockResolvedValueOnce({ id: 'other' } as never);
      await service.restore('u1', 'b1');

      expect(prisma.inventoryItem.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'b1' },
        data: { deletedAt: null, slotColumn: null, slotRow: null },
      }));
    });

    // Review #789: the locking rule — the family before its unit.
    it('locks the family before writing the unit back', async () => {
      vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValueOnce(unitRow({ deletedAt: new Date() }, { deletedAt: new Date() }) as never);
      await service.restore('u1', 'b1');

      const [, productId] = vi.mocked(prisma.$queryRaw).mock.calls[0] as unknown as [string[], string];
      expect(productId).toBe('p1');
      expect(vi.mocked(prisma.$queryRaw).mock.invocationCallOrder[0])
        .toBeLessThan(vi.mocked(prisma.product.update).mock.invocationCallOrder[0]);
      expect(vi.mocked(prisma.$queryRaw).mock.invocationCallOrder[0])
        .toBeLessThan(vi.mocked(prisma.inventoryItem.update).mock.invocationCallOrder[0]);
    });

    // #471 (D10): a unit back from the trash brings its family back with it.
    it('takes the family out of the trash with it', async () => {
      vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValueOnce(
        unitRow({ deletedAt: new Date() }, { deletedAt: new Date() }) as never,
      );
      await service.restore('u1', 'b1');

      expect(prisma.product.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { deletedAt: null } });
      expect(prisma.inventoryItem.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'b1' }, data: { deletedAt: null } }));
    });

    it('leaves a family that is not in the trash alone', async () => {
      vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValueOnce(unitRow({ deletedAt: new Date() }) as never);
      await service.restore('u1', 'b1');

      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('keeps the slot when it is still free', async () => {
      vi.mocked(prisma.inventoryItem.findFirst)
        .mockResolvedValueOnce(trashed as never)
        .mockResolvedValueOnce(null);
      await service.restore('u1', 'b1');

      expect(prisma.inventoryItem.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'b1' }, data: { deletedAt: null } }));
    });
  });

  it('updateItem - a manual edit overrides lockedFields (manual entry has priority)', async () => {
    const existingItem = unitRow({}, { lockedFields: ['name', 'vintage'] });
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(existingItem as never);

    // Default options → isManualEdit: true, matching the regular PATCH /:id
    // and guest write routes: a locked field must still accept a fresh
    // manual edit (e.g. re-editing quantity, or resetting fillLevel/isOpened
    // back to "full" after it was previously set to "empty").
    await service.updateItem('u1', 'b1', {
      category: 'wine',
      name: 'New Name',
      producer: 'New Producer',
    });

    // #471: the description is written on the family.
    expect(productUpdateData()).toMatchObject({ name: 'New Name', producer: 'New Producer' });
  });

  it('updateItem - a non-manual (automated) update still respects lockedFields', async () => {
    const existingItem = unitRow({}, { lockedFields: ['name', 'vintage'] });
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(existingItem as never);

    await service.updateItem(
      'u1',
      'b1',
      {
        category: 'wine',
        name: 'Should Not Change', // locked, and this call isn't manual → stripped
        producer: 'New Producer',   // not locked → allowed
      },
      { isManualEdit: false }
    );

    expect(productUpdateData()?.name).toBeUndefined();
    expect(productUpdateData()?.producer).toBe('New Producer');
  });

  // #706: a patch moving one end of the window is checked against the other.
  it('updateItem - refuses a patch whose window would end before the stored start', async () => {
    const existingItem = unitRow({}, { peakMaturityFrom: 2035, peakMaturityTo: 2040 });
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(existingItem as never);

    await expect(service.updateItem('u1', 'b1', { peakMaturityTo: 2028 })).rejects.toThrow(ZodError);
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('updateItem - accepts moving one end while the window stays in order', async () => {
    const existingItem = unitRow({}, { peakMaturityFrom: 2035, peakMaturityTo: 2040 });
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(existingItem as never);

    await service.updateItem('u1', 'b1', { peakMaturityTo: 2036 });
    expect(productUpdateData()).toMatchObject({ peakMaturityTo: 2036 });
  });

  it('bulkUpdate - refuses moving one end of the window before an item\'s stored start', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      unitRow({ id: 'b2', productId: 'p2' }),
      unitRow({ id: 'b1', productId: 'p1' }),
    ] as never);
    // #471: checked on each family as stored once locked, in the transaction.
    const windows: Record<string, Record<string, unknown>> = {
      p1: { peakMaturityFrom: 2025, peakMaturityTo: 2040 },
      p2: { peakMaturityFrom: 2035, peakMaturityTo: 2040 },
    };
    vi.mocked(prisma.product.findUniqueOrThrow).mockImplementation((async (args: { where: { id: string } }) =>
      family({ id: args.where.id, ...windows[args.where.id] })) as never);

    // The ZodError rolls the whole transaction back, b1's family included.
    await expect(service.bulkUpdate('u1', ['b1', 'b2'], { peakMaturityTo: 2030 })).rejects.toThrow(ZodError);
    // Families locked in a stable order (by id), all of them before any
    // write: no deadlock between two bulk actions.
    expect(vi.mocked(prisma.$queryRaw).mock.calls.map((call) => call[1])).toEqual(['p1', 'p2', 'p1', 'p2']);
    // p2's reversed window is never written.
    expect(vi.mocked(prisma.product.update).mock.calls.map((call) => call[0].where.id)).toEqual(['p1']);
  });

  // ─── FEAT-16/23: offline sync optimistic concurrency ──────────────────────

  it('updateItem - returns a conflict when expectedUpdatedAt no longer matches the server value', async () => {
    const serverUpdatedAt = new Date('2026-08-01T10:00:00.000Z');
    const existingItem = unitRow({ updatedAt: serverUpdatedAt }, { name: 'Talbot' });
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(existingItem as never);

    const result = await service.updateItem('u1', 'b1', {
      isOpened: true,
      // Stale timestamp: the item was modified server-side after this
      // mutation was queued offline.
      expectedUpdatedAt: '2026-08-01T09:00:00.000Z',
    } as never);

    // The server's flat record: the unit with its family's description.
    expect(result).toMatchObject({ conflict: true, serverItem: { id: 'b1', name: 'Talbot', updatedAt: serverUpdatedAt } });
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
  });

  it('updateItem - applies the patch when expectedUpdatedAt matches the server value', async () => {
    const serverUpdatedAt = new Date('2026-08-01T10:00:00.000Z');
    const existingItem = unitRow({ updatedAt: serverUpdatedAt });
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(existingItem as never);

    const result = await service.updateItem('u1', 'b1', {
      isOpened: true,
      expectedUpdatedAt: serverUpdatedAt.toISOString(),
    } as never);

    expect(result && 'conflict' in result).toBe(false);
    const updateCall = vi.mocked(prisma.inventoryItem.update).mock.calls[0];
    const updateData = updateCall?.[0] as { data: Record<string, unknown> };
    // `expectedUpdatedAt` must never leak into the Prisma write payload.
    expect(updateData.data.expectedUpdatedAt).toBeUndefined();
    expect(updateData.data.isOpened).toBe(true);
  });

  // #572: the edit form now sends only the changed fields. The other fields
  // must keep their scan/import source and stay unlocked.
  it('updateItem - a one-field manual edit locks that field only and keeps the other sources', async () => {
    const existingItem = unitRow(
      { lockedFields: ['fillLevel'], fieldSources: { purchasePlace: 'import_csv' }, purchasePrice: 20 },
      { lockedFields: ['notes'], fieldSources: { name: 'ocr', vintage: 'ocr', region: 'import_csv' } },
    );
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(existingItem as never);

    await service.updateItem('u1', 'b1', { purchasePrice: 25 });

    const updateData = vi.mocked(prisma.inventoryItem.update).mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(updateData.data.purchasePrice).toBe(25);
    expect(updateData.data.lockedFields).toEqual(['fillLevel', 'purchasePrice']);
    // Provenance untouched: the column is not even rewritten.
    expect(updateData.data.fieldSources).toBeUndefined();
    // #471: a unit-only edit leaves the family alone (no write, no updatedAt bump).
    expect(prisma.product.update).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  // ─── #471 (FEAT-103, D8): a state written on a group detaches one copy ─────

  describe('updateItem - detach (D8)', () => {
    const DAY = new Date('2026-01-15T00:00:00.000Z');
    const group = () => unitRow({
      quantity: 6, cigarsPerBox: null, cigarsLeft: null, writtenOffAt: null, parentItemId: null, cellarId: 'c1',
      purchasePrice: 20, estimatedValue: null, purchasedAt: DAY, bottleSize: '75cl', slotColumn: null, slotRow: null, updatedAt: DAY,
    }, { name: 'Talbot', category: 'wine' });

    beforeEach(() => {
      vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(group() as never);
      vi.mocked(prisma.inventoryItem.update).mockImplementation(((args: { where: { id: string }; data: Record<string, unknown> }) =>
        Promise.resolve({ ...group(), ...args.data, id: args.where.id })) as never);
      vi.mocked(prisma.inventoryItem.create).mockResolvedValue({} as never);
      vi.mocked(prisma.inventoryItem.findUniqueOrThrow).mockImplementation(((args: { where: { id: string } }) =>
        Promise.resolve({ ...group(), id: args.where.id, quantity: 1, isOpened: true, fillLevel: 60, parentItemId: 'b1' })) as never);
    });

    it('answers the opened bottle as data, the group it came from in changed', async () => {
      const result = await service.updateItem('u1', 'b1', { isOpened: true, fillLevel: 60, expectedUpdatedAt: DAY.toISOString() });

      if (!result || 'conflict' in result) throw new Error('expected a write');
      // `data` stays a flat record: the current callers keep reading it.
      expect(result.item).toMatchObject({ quantity: 1, isOpened: true, fillLevel: 60, parentItemId: 'b1', name: 'Talbot' });
      expect(result.item.id).not.toBe('b1');
      expect(result.changed).toEqual([expect.objectContaining({ id: 'b1', quantity: 5, isOpened: false, purchasedAt: '2026-01-15' })]);
      expect(result.changed[0]).not.toHaveProperty('name');
      expect(result.removedIds).toEqual([]);
      expect(result.outcome).toBe('detached');
      // The group's history gets its own line: one copy fewer.
      expect(result.groupChange).toEqual({ itemId: 'b1', from: 6, to: 5 });
      const created = vi.mocked(prisma.inventoryItem.create).mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(created.data).toMatchObject({ productId: 'p1', quantity: 1, isOpened: true, fillLevel: 60, parentItemId: 'b1', slotColumn: null });
    });

    it('locks the family, then reads the unit again, before deciding', async () => {
      await service.updateItem('u1', 'b1', { isOpened: true, fillLevel: 60 });

      expect(vi.mocked(prisma.$queryRaw).mock.invocationCallOrder[0])
        .toBeLessThan(vi.mocked(prisma.inventoryItem.findUnique).mock.invocationCallOrder[0]);
      expect(vi.mocked(prisma.inventoryItem.findUnique).mock.invocationCallOrder[0])
        .toBeLessThan(vi.mocked(prisma.inventoryItem.update).mock.invocationCallOrder[0]);
    });

    it('decides on the count as it is once locked, not as first read', async () => {
      // Another member opened one in between: 5 left, not 6.
      vi.mocked(prisma.inventoryItem.findUnique).mockResolvedValue({ ...group(), quantity: 5 } as never);

      await service.updateItem('u1', 'b1', { isOpened: true, fillLevel: 60 });

      const groupWrite = vi.mocked(prisma.inventoryItem.update).mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(groupWrite.data.quantity).toBe(4);
    });

    it('a replayed write is a conflict once the group has changed under the lock (offline queue)', async () => {
      // First read still the old group; once locked, the first replay has already bumped it.
      vi.mocked(prisma.inventoryItem.findUnique).mockResolvedValue({ ...group(), quantity: 5, updatedAt: new Date('2026-10-31T10:00:00.000Z') } as never);

      const result = await service.updateItem('u1', 'b1', { isOpened: true, fillLevel: 60, expectedUpdatedAt: DAY.toISOString() });

      expect(result).toMatchObject({ conflict: true });
      expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
      expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
    });

    // A2 review (#788): a count sent with expectedUpdatedAt while a write-off
    // of 2 committed in between must not land on top of it (7 + 2 = 9).
    it('a count checked against expectedUpdatedAt as stored once locked, not as first read', async () => {
      vi.mocked(prisma.inventoryItem.findUnique).mockResolvedValue({ ...group(), quantity: 4, updatedAt: new Date('2026-10-31T10:00:00.000Z') } as never);

      const result = await service.updateItem('u1', 'b1', { quantity: 7, expectedUpdatedAt: DAY.toISOString() });

      expect(result).toMatchObject({ conflict: true });
      expect(vi.mocked(prisma.$queryRaw).mock.invocationCallOrder[0])
        .toBeLessThan(vi.mocked(prisma.inventoryItem.findUnique).mock.invocationCallOrder[0]);
      expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('smokeOne and keepTastings never reach a column', async () => {
      vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue({ ...group(), quantity: 1 } as never);

      await service.updateItem('u1', 'b1', { fillLevel: 50, keepTastings: true });

      const written = vi.mocked(prisma.inventoryItem.update).mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(written.data).not.toHaveProperty('keepTastings');
      expect(written.data).not.toHaveProperty('smokeOne');
    });
  });

  it('bulkUpdate - drinks one bottle of each selected group (D18), the family locked first', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      unitRow({ id: 'b1', quantity: 6, isOpened: false, fillLevel: null, cigarsLeft: null, writtenOffAt: null }),
    ] as never);
    vi.mocked(prisma.inventoryItem.findUnique).mockImplementation((async () =>
      unitRow({ id: 'b1', quantity: 6, isOpened: false, fillLevel: null, cigarsLeft: null, writtenOffAt: null })) as never);
    vi.mocked(prisma.inventoryItem.findUniqueOrThrow).mockResolvedValue(unitRow({ id: 'sub' }) as never);

    const count = await service.bulkUpdate('u1', ['b1'], { isOpened: true, fillLevel: 0 });

    expect(count).toBe(1);
    const groupWrite = vi.mocked(prisma.inventoryItem.update).mock.calls[0]?.[0] as { where: { id: string }; data: Record<string, unknown> };
    expect(groupWrite).toMatchObject({ where: { id: 'b1' }, data: { quantity: 5 } });
    expect(groupWrite.data).not.toHaveProperty('isOpened');
    expect(prisma.inventoryItem.create).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.$queryRaw).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(prisma.inventoryItem.update).mock.invocationCallOrder[0]);
  });

  // ─── #471: the flat record is split between the family and the unit ────────

  describe('updateItem - family / unit split (#471)', () => {
    it('writes the description on the family, then mirrors it onto its units without touching their updatedAt', async () => {
      vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(unitRow({}, { region: 'Bordeaux' }) as never);

      await service.updateItem('u1', 'b1', { region: 'Médoc', purchasePrice: 25 });

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { region: 'Médoc', lockedFields: ['region'], updatedBy: 'u1' },
      });
      // The mirror: one SQL statement copying the family columns onto every unit of the family.
      const [sql, ...values] = vi.mocked(prisma.$executeRaw).mock.calls[0] as unknown as [string[], ...unknown[]];
      expect(sql.join('?')).toContain('UPDATE "bottles"');
      expect(values).toContain('p1');
      const unitData = vi.mocked(prisma.inventoryItem.update).mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(unitData.data).toMatchObject({ purchasePrice: 25, lockedFields: ['purchasePrice'], updatedBy: 'u1' });
      expect(unitData.data).not.toHaveProperty('region');
      // Family first, then the unit, which comes back with the new mirror.
      expect(vi.mocked(prisma.product.update).mock.invocationCallOrder[0])
        .toBeLessThan(vi.mocked(prisma.inventoryItem.update).mock.invocationCallOrder[0]);
    });

    // #471 (W3 review, design.md rule 4): a group edited into an identical one joins it.
    describe('a group made identical to another one by an edit', () => {
      const OCT = new Date('2026-10-01T00:00:00.000Z');
      const SEP = new Date('2026-09-01T00:00:00.000Z');
      const line = (id: string, fields: Record<string, unknown> = {}) => ({
        id, userId: 'u1', productId: 'p1', cellarId: 'garage', purchasePrice: 20, estimatedValue: null, bottleSize: null,
        cigarsPerBox: null, cigarsLeft: null, isOpened: false, fillLevel: null, openedAt: null, writtenOffAt: null,
        deletedAt: null, isOwned: true, needsReview: false, slotColumn: null, slotRow: null, parentItemId: null,
        purchasePlace: null, location: null, lockedFields: [], fieldSources: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-10-02T00:00:00.000Z'), ...fields,
      });
      beforeEach(() => {
        // The edited ×2 bought in September; the ×6 bought in October, older.
        vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue({ ...line('b2', { quantity: 2, purchasedAt: SEP }), product: family() } as never);
        vi.mocked(prisma.inventoryItem.update).mockImplementation(((args: { where: { id: string }; data: Record<string, unknown> }) =>
          Promise.resolve({ ...line(args.where.id, { quantity: args.where.id === 'b6' ? 6 : 2, purchasedAt: OCT }), ...args.data, product: family() })) as never);
        vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([line('b6', { quantity: 6, purchasedAt: OCT, createdAt: new Date('2025-12-01T00:00:00.000Z') })] as never);
        vi.mocked(prisma.inventoryCountEntry.findMany).mockResolvedValue([] as never);
        vi.mocked(prisma.inventoryItem.findUniqueOrThrow).mockResolvedValue({ ...line('b6', { quantity: 8, purchasedAt: OCT }), product: family() } as never);
      });

      it('its purchase day set to the other one\'s: one line ×8, the edited one removed (D8)', async () => {
        const result = await service.updateItem('u1', 'b2', { purchasedAt: OCT });

        expect(result).toMatchObject({ item: { id: 'b6', quantity: 8 }, removedIds: ['b2'], joined: { from: 6, to: 8 } });
        // The older group takes the copies; the edited one is deleted, in the same transaction.
        expect(prisma.inventoryItem.update).toHaveBeenLastCalledWith(expect.objectContaining({
          where: { id: 'b6' }, data: expect.objectContaining({ quantity: 8 }),
        }));
        expect(prisma.inventoryItem.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['b2'] } } });
      });

      it('never with a group still to review, nor when both are in a slot', async () => {
        vi.mocked(prisma.inventoryItem.findMany).mockResolvedValueOnce([] as never); // settledOnly: none settled
        expect(await service.updateItem('u1', 'b2', { purchasedAt: OCT })).not.toHaveProperty('joined');

        vi.mocked(prisma.inventoryItem.update).mockImplementation(((args: { where: { id: string } }) =>
          Promise.resolve({ ...line(args.where.id, { quantity: 2, purchasedAt: OCT, slotColumn: 1, slotRow: 1 }), product: family() })) as never);
        vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([line('b6', { quantity: 6, purchasedAt: OCT, slotColumn: 2, slotRow: 1 })] as never);
        expect(await service.updateItem('u1', 'b2', { purchasedAt: OCT })).not.toHaveProperty('joined');
        expect(prisma.inventoryItem.deleteMany).not.toHaveBeenCalled();
      });

      it.each([
        ['places of purchase', { purchasePlace: 'Caviste A' }, { purchasePlace: 'Caviste B' }],
        ['locations', { location: 'Bas' }, { location: 'Haut' }],
      ])('never when their %s contradict each other: neither is lost (rule 4)', async (_label, target, edited) => {
        vi.mocked(prisma.inventoryItem.update).mockImplementation(((args: { where: { id: string } }) =>
          Promise.resolve({ ...line(args.where.id, { quantity: 2, purchasedAt: OCT, ...edited }), product: family() })) as never);
        vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([line('b6', { quantity: 6, purchasedAt: OCT, ...target })] as never);

        expect(await service.updateItem('u1', 'b2', { purchasedAt: OCT })).not.toHaveProperty('joined');
        expect(prisma.inventoryItem.deleteMany).not.toHaveBeenCalled();
      });

      it('nothing to join when no field of the group changed', async () => {
        const result = await service.updateItem('u1', 'b2', { location: 'Étagère' });
        expect(result).not.toHaveProperty('joined');
        expect(prisma.inventoryItem.findMany).not.toHaveBeenCalled();
      });
    });

    // #471 (W3): "Modifier" a line — its purchase day is the line's own, never the family's.
    it('writes a purchase day on the unit, recorded in its history', async () => {
      vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(unitRow() as never);
      const day = new Date('2026-03-14T00:00:00.000Z');

      const result = await service.updateItem('u1', 'b1', { purchasedAt: day });

      const unitData = vi.mocked(prisma.inventoryItem.update).mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(unitData.data).toMatchObject({ purchasedAt: day });
      expect(prisma.product.update).not.toHaveBeenCalled();
      expect(result).toMatchObject({ changes: [{ field: 'purchasedAt', to: day }] });
    });

    // #471 (F2 review): two members editing the family through two sibling
    // bottles — the family is locked and re-read in the transaction, so the
    // first one's lock and window are not computed away by the second.
    describe('concurrent edits of one family through sibling bottles', () => {
      it('locks the family row before reading it, inside the transaction', async () => {
        vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(unitRow() as never);

        await service.updateItem('u1', 'b1', { region: 'Médoc' });

        const [sql, productId] = vi.mocked(prisma.$queryRaw).mock.calls[0] as unknown as [string[], string];
        expect(sql.join('?')).toMatch(/FROM "products" WHERE "id" = \? FOR UPDATE/);
        expect(productId).toBe('p1');
        expect(vi.mocked(prisma.$queryRaw).mock.invocationCallOrder[0])
          .toBeLessThan(vi.mocked(prisma.product.findUniqueOrThrow).mock.invocationCallOrder[0]);
        expect(vi.mocked(prisma.$transaction).mock.invocationCallOrder[0])
          .toBeLessThan(vi.mocked(prisma.$queryRaw).mock.invocationCallOrder[0]);
      });

      it("keeps the lock another member's edit just put on the family", async () => {
        // Read before the other edit committed: no lock yet.
        vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(unitRow({ id: 'b2' }) as never);
        // Once locked: the sibling bottle's edit of the colour is there.
        vi.mocked(prisma.product.findUniqueOrThrow).mockResolvedValue(family({ color: 'red', lockedFields: ['color'] }) as never);

        await service.updateItem('u1', 'b2', { region: 'Médoc' });

        expect(productUpdateData()).toMatchObject({ region: 'Médoc', lockedFields: ['color', 'region'] });
      });

      it('checks a drinking window end against the other end as stored once locked', async () => {
        vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(unitRow({ id: 'b2' }) as never);
        vi.mocked(prisma.product.findUniqueOrThrow).mockResolvedValue(family({ peakMaturityFrom: 2030 }) as never);

        await expect(service.updateItem('u1', 'b2', { peakMaturityTo: 2025 })).rejects.toBeInstanceOf(ZodError);
        expect(prisma.product.update).not.toHaveBeenCalled();
        expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
      });

      it('records the change from the value stored once locked', async () => {
        vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(unitRow({}, { region: 'Bordeaux' }) as never);
        vi.mocked(prisma.product.findUniqueOrThrow).mockResolvedValue(family({ region: 'Graves' }) as never);

        const result = await service.updateItem('u1', 'b1', { region: 'Médoc', fillLevel: 50 });

        expect(result).toMatchObject({ changes: [{ field: 'region', from: 'Graves', to: 'Médoc' }, { field: 'fillLevel', from: null, to: 50 }] });
      });
    });

    it('recomputes the alert status on the family when the drinking window moves', async () => {
      vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(unitRow() as never);
      const year = new Date().getFullYear();

      await service.updateItem('u1', 'b1', { peakMaturityFrom: year - 1, peakMaturityTo: year + 2 });

      expect(productUpdateData()).toMatchObject({ alertStatus: 'peak' });
    });

    it('never takes an alert status from the patch', async () => {
      vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(unitRow() as never);

      await service.updateItem('u1', 'b1', { alertStatus: 'peak', fillLevel: 50 });

      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('a non-manual update keeps the field sources on the side of each field', async () => {
      vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(unitRow() as never);

      await service.updateItem('u1', 'b1', { name: 'Talbot', bottleSize: '75cl' }, {
        isManualEdit: false, fieldSources: { name: 'ocr', bottleSize: 'ocr' },
      });

      expect(productUpdateData()).toMatchObject({ name: 'Talbot', fieldSources: { name: 'ocr' } });
      expect(productUpdateData()).not.toHaveProperty('lockedFields');
      const unitData = vi.mocked(prisma.inventoryItem.update).mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(unitData.data).toMatchObject({ bottleSize: '75cl', fieldSources: { bottleSize: 'ocr' } });
    });

    it('answers with the flat record, its locks and sources merged from both sides', async () => {
      vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(unitRow() as never);
      vi.mocked(prisma.inventoryItem.update).mockResolvedValue(unitRow(
        { region: 'stale', lockedFields: ['fillLevel', 'region'], fieldSources: { purchasePlace: 'import_csv', region: 'ocr' } },
        { region: 'Médoc', lockedFields: ['region'], fieldSources: { name: 'ocr' } },
      ) as never);

      const result = await service.updateItem('u1', 'b1', { region: 'Médoc' });

      const item = result && 'item' in result ? result.item : null;
      expect(item).toMatchObject({ region: 'Médoc', fieldSources: { purchasePlace: 'import_csv', name: 'ocr' } });
      expect([...(item?.lockedFields ?? [])].sort()).toEqual(['fillLevel', 'region']);
    });
  });

  // ─── ISSUE_034: bulk actions must not be neutralised by lockedFields ──────

  /**
   * Wires the mocked `$transaction` to run its callback against a fake
   * transaction client and returns that client's `update` spy.
   */
  function mockTransactionClient() {
    const update = vi.fn().mockResolvedValue({} as never);
    // #471: a unit written with a state is read again once its family is locked.
    const findUnique = vi.fn(async (args: { where: { id: string } }) => {
      const rows = (await vi.mocked(prisma.inventoryItem.findMany).mock.results.at(0)?.value) as Array<{ id: string }>;
      return rows.find((row) => row.id === args.where.id) ?? null;
    });
    vi.mocked(prisma.$transaction).mockImplementation(
      ((callback: (tx: unknown) => unknown) => callback({ inventoryItem: { update, findUnique }, $queryRaw: prisma.$queryRaw })) as never,
    );
    return update;
  }

  // A2 (lock order, #787 review): a patch of unit fields only writes no
  // description, yet its families are locked first, in sorted order —
  // otherwise it deadlocks (40P01) with a description write, which locks the
  // family and then copies onto its units.
  it('bulkUpdate - locks the families in sorted order before writing unit fields only', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      unitRow({ id: 'b3', productId: 'p2', cellarId: 'c1' }),
      unitRow({ id: 'b2', productId: 'p2', cellarId: 'c1' }),
      unitRow({ id: 'b1', productId: 'p1', cellarId: 'c1' }),
      unitRow({ id: 'b4', productId: 'P0', cellarId: 'c1' }),
    ] as never);
    const txUpdate = mockTransactionClient();

    expect(await service.bulkUpdate('u1', ['b1', 'b2', 'b3', 'b4'], { cellarId: 'c2' })).toBe(4);

    // By code unit, as the slot swap does (lockFamilies): 'P0' < 'p1'.
    expect(vi.mocked(prisma.$queryRaw).mock.calls.map((call) => call[1])).toEqual(['P0', 'p1', 'p2']);
    const lastLock = Math.max(...vi.mocked(prisma.$queryRaw).mock.invocationCallOrder);
    expect(Math.min(...txUpdate.mock.invocationCallOrder)).toBeGreaterThan(lastLock);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('bulkUpdate - applies the patch to locked fields (a bulk action is a user action)', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      unitRow({ lockedFields: ['fillLevel', 'isOpened'], isOpened: false, fillLevel: 100 }),
    ] as never);
    const txUpdate = mockTransactionClient();

    const count = await service.bulkUpdate('u1', ['b1'], { isOpened: true, fillLevel: 0 } as never);

    expect(count).toBe(1);
    expect(txUpdate).toHaveBeenCalledTimes(1);
    const data = (txUpdate.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(data.isOpened).toBe(true);
    expect(data.fillLevel).toBe(0);
  });

  it('bulkUpdate - only counts the items it really changed', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      // Already opened and empty → the patch is a no-op for this one.
      unitRow({ id: 'noop', isOpened: true, fillLevel: 0 }),
      unitRow({ id: 'changed', isOpened: false, fillLevel: 80 }),
    ] as never);
    const txUpdate = mockTransactionClient();

    const count = await service.bulkUpdate('u1', ['noop', 'changed'], {
      isOpened: true,
      fillLevel: 0,
    } as never);

    expect(count).toBe(1);
    expect(txUpdate).toHaveBeenCalledTimes(1);
    expect(txUpdate.mock.calls[0]?.[0]).toMatchObject({ where: { id: 'changed' } });
  });

  // #471: description fields go to the family, once per family.
  it('bulkUpdate - writes a shared family once and the unit fields on each unit', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      unitRow({ id: 'b1', cellarId: 'c1' }, { region: 'Bordeaux' }),
      unitRow({ id: 'b2', cellarId: 'c1' }, { region: 'Bordeaux' }),
    ] as never);

    const count = await service.bulkUpdate('u1', ['b1', 'b2'], { region: 'Médoc', cellarId: 'c2' });

    expect(count).toBe(2);
    expect(prisma.product.update).toHaveBeenCalledTimes(1);
    expect(productUpdateData()).toEqual({ region: 'Médoc', updatedBy: 'u1' });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    for (const call of vi.mocked(prisma.inventoryItem.update).mock.calls) {
      const data = (call[0] as { data: Record<string, unknown> }).data;
      expect(data.cellarId).toBe('c2');
      expect(data).not.toHaveProperty('region');
    }
  });

  it('bulkUpdate - returns 0 and writes nothing when no item matches', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

    const count = await service.bulkUpdate('u1', ['unknown'], { isOpened: true } as never);

    expect(count).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ─── #573: a finished bottle gives its grid slot back ──────────────────────

  describe('finished bottle - grid slot (#573)', () => {
    const slotted = unitRow({ cellarId: 'c1', slotColumn: 2, slotRow: 3, isOpened: true, fillLevel: 25 });

    function updateData() {
      return (vi.mocked(prisma.inventoryItem.update).mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    }

    it('updateItem - finishing a slotted bottle clears its slot without the occupancy check', async () => {
      // Every lookup returns a row: had the slot-occupancy query run, it
      // would have reported the slot as taken and refused the write.
      vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(slotted as never);

      const result = await service.updateItem('u1', 'b1', { fillLevel: 0 });

      expect(prisma.inventoryItem.findFirst).toHaveBeenCalledTimes(1);
      expect(result).not.toHaveProperty('slotConflict');
      expect(updateData()).toMatchObject({ fillLevel: 0, slotColumn: null, slotRow: null });
      // The history records which slot the bottle left.
      expect(result && 'changes' in result ? result.changes : null).toEqual([
        { field: 'fillLevel', from: 25, to: 0 },
        { field: 'slotColumn', from: 2, to: null },
        { field: 'slotRow', from: 3, to: null },
      ]);
    });

    it('updateItem - the released slot wins over a slot sent alongside', async () => {
      vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(slotted as never);

      await service.updateItem('u1', 'b1', { isOpened: true, fillLevel: 0, slotColumn: 2, slotRow: 3 });

      expect(prisma.inventoryItem.findFirst).toHaveBeenCalledTimes(1);
      expect(updateData()).toMatchObject({ slotColumn: null, slotRow: null });
    });

    it('updateItem - a bottle that is not finished keeps its slot', async () => {
      vi.mocked(prisma.inventoryItem.findFirst)
        .mockResolvedValueOnce(slotted as never)
        .mockResolvedValueOnce(null); // the slot-occupancy check still runs, and passes

      const result = await service.updateItem('u1', 'b1', { fillLevel: 50 });

      expect(prisma.inventoryItem.findFirst).toHaveBeenCalledTimes(2);
      const data = updateData();
      expect(data.fillLevel).toBe(50);
      expect(data).not.toHaveProperty('slotColumn');
      expect(data).not.toHaveProperty('slotRow');
      expect(result && 'changes' in result ? result.changes : null).toEqual([
        { field: 'fillLevel', from: 25, to: 50 },
      ]);
    });

    it('bulkUpdate - finishing a slotted item clears its slot', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        { ...slotted, isOpened: false, fillLevel: 100 },
      ] as never);
      const txUpdate = mockTransactionClient();

      const count = await service.bulkUpdate('u1', ['b1'], { isOpened: true, fillLevel: 0 });

      expect(count).toBe(1);
      expect(txUpdate.mock.calls[0]?.[0]).toMatchObject({
        where: { id: 'b1' },
        data: { isOpened: true, fillLevel: 0, slotColumn: null, slotRow: null },
      });
    });

    it('bulkUpdate - an item left unfinished keeps its slot', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([slotted] as never);
      const txUpdate = mockTransactionClient();

      const count = await service.bulkUpdate('u1', ['b1'], { fillLevel: 50 });

      expect(count).toBe(1);
      const data = (txUpdate.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
      expect(data.fillLevel).toBe(50);
      expect(data).not.toHaveProperty('slotColumn');
      expect(data).not.toHaveProperty('slotRow');
    });
  });

  // ─── #798: moving a bottle to another cellar ───────────────────────────────

  describe('cellar move - grid slot (#798)', () => {
    // #471: a unit read with its family, as `updateItem`/`bulkUpdate` read it.
    const slotted = unitRow({ cellarId: 'c1', slotColumn: 2, slotRow: 3, isOpened: false, fillLevel: 100 });

    function updateData() {
      return (vi.mocked(prisma.inventoryItem.update).mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    }

    it('updateItem - a cellar change without slot coordinates clears the slot', async () => {
      vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValueOnce(slotted as never);
      vi.mocked(prisma.inventoryItem.update).mockResolvedValue(unitRow({ cellarId: 'c2', slotColumn: null, slotRow: null }) as never);

      const result = await service.updateItem('u1', 'b1', { cellarId: 'c2' });

      expect(result).not.toHaveProperty('slotConflict');
      expect(updateData()).toMatchObject({ cellarId: 'c2', slotColumn: null, slotRow: null });
      expect(result && 'changes' in result ? result.changes : null).toEqual([
        { field: 'cellarId', from: 'c1', to: 'c2' },
        { field: 'slotColumn', from: 2, to: null },
        { field: 'slotRow', from: 3, to: null },
      ]);
    });

    it('updateItem - the old coordinates being taken in the new cellar no longer refuses the move', async () => {
      // Every lookup returns a row: had the occupancy query run on
      // (c2, 2, 3), it would have reported the slot as taken (409).
      vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(slotted as never);
      vi.mocked(prisma.inventoryItem.update).mockResolvedValue(unitRow({ cellarId: 'c2', slotColumn: null, slotRow: null }) as never);

      const result = await service.updateItem('u1', 'b1', { cellarId: 'c2' });

      expect(prisma.inventoryItem.findFirst).toHaveBeenCalledTimes(1);
      expect(result).not.toHaveProperty('slotConflict');
      expect(updateData()).toMatchObject({ cellarId: 'c2', slotColumn: null, slotRow: null });
    });

    it('updateItem - a cellar change with explicit coordinates places the bottle there', async () => {
      vi.mocked(prisma.inventoryItem.findFirst)
        .mockResolvedValueOnce(slotted as never)
        .mockResolvedValueOnce(null); // the target slot is free
      vi.mocked(prisma.inventoryItem.update).mockResolvedValue(unitRow({ cellarId: 'c2', slotColumn: 1, slotRow: 4 }) as never);

      const result = await service.updateItem('u1', 'b1', { cellarId: 'c2', slotColumn: 1, slotRow: 4 });

      expect(result).not.toHaveProperty('slotConflict');
      expect(vi.mocked(prisma.inventoryItem.findFirst).mock.calls[1]?.[0]).toMatchObject({
        where: { cellarId: 'c2', slotColumn: 1, slotRow: 4, id: { not: 'b1' } },
      });
      expect(updateData()).toMatchObject({ cellarId: 'c2', slotColumn: 1, slotRow: 4 });
    });

    it('updateItem - a cellar change with explicit coordinates taken in the new cellar is refused', async () => {
      vi.mocked(prisma.inventoryItem.findFirst)
        .mockResolvedValueOnce(slotted as never)
        .mockResolvedValueOnce({ id: 'other' } as never);

      const result = await service.updateItem('u1', 'b1', { cellarId: 'c2', slotColumn: 1, slotRow: 4 });

      expect(result).toMatchObject({ slotConflict: true });
      expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    });

    it('updateItem - resending the same cellar keeps the slot', async () => {
      vi.mocked(prisma.inventoryItem.findFirst)
        .mockResolvedValueOnce(slotted as never)
        .mockResolvedValueOnce(null);
      vi.mocked(prisma.inventoryItem.update).mockResolvedValue(unitRow({ cellarId: 'c1', slotColumn: 2, slotRow: 3, notes: 'x' }) as never);

      await service.updateItem('u1', 'b1', { cellarId: 'c1', notes: 'x' });

      const data = updateData();
      expect(data).not.toHaveProperty('slotColumn');
      expect(data).not.toHaveProperty('slotRow');
    });

    it('bulkUpdate - moving items to another cellar clears their slot', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        slotted,
        { ...slotted, id: 'b2', cellarId: 'c2', slotColumn: 5, slotRow: 1 },
      ] as never);
      const txUpdate = mockTransactionClient();

      const count = await service.bulkUpdate('u1', ['b1', 'b2'], { cellarId: 'c2' });

      // b2 is already in c2: unchanged, so neither written nor unplaced.
      expect(count).toBe(1);
      expect(txUpdate).toHaveBeenCalledTimes(1);
      expect(txUpdate.mock.calls[0]?.[0]).toMatchObject({
        where: { id: 'b1' },
        data: { cellarId: 'c2', slotColumn: null, slotRow: null },
      });
    });

    it('bulkUpdate - an item moved with a state change also arrives unplaced', async () => {
      // #471: a state in the patch goes through the detach rule (applyState),
      // which must still carry the slot release of the move.
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([slotted] as never);
      const txUpdate = mockTransactionClient();

      const count = await service.bulkUpdate('u1', ['b1'], { cellarId: 'c2', isOpened: true, fillLevel: 50 });

      expect(count).toBe(1);
      expect(txUpdate).toHaveBeenCalledTimes(1);
      expect(txUpdate.mock.calls[0]?.[0]).toMatchObject({
        where: { id: 'b1' },
        data: { cellarId: 'c2', isOpened: true, fillLevel: 50, slotColumn: null, slotRow: null },
      });
    });
  });

  // ISSUE_141/ISSUE_068: port of web/lib/inventory/duplicate.ts's isDuplicateOf,
  // applied server-side — the one check that previously existed only in the browser.
  describe('findDuplicateCandidate', () => {
    it('matches case-insensitively on producer + name + vintage for wine', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        { id: 'existing', category: 'wine', producer: 'Château Pétrus', name: 'pétrus', vintage: 2015, bottleSize: '75cl' },
      ] as never);

      const result = await service.findDuplicateCandidate({
        category: 'wine', producer: 'château pétrus', name: 'PÉTRUS', vintage: 2015, bottleSize: '75cl',
      } as never);

      expect(result).toMatchObject({ id: 'existing' });
    });

    it('does not match a different vintage', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        { id: 'existing', category: 'wine', producer: 'Château Pétrus', name: 'Pétrus', vintage: 2010, bottleSize: '75cl' },
      ] as never);

      const result = await service.findDuplicateCandidate({
        category: 'wine', producer: 'Château Pétrus', name: 'Pétrus', vintage: 2015, bottleSize: '75cl',
      } as never);

      expect(result).toBeNull();
    });

    it('treats a missing vintage on either side as a potential match', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        { id: 'existing', category: 'wine', producer: 'Château Pétrus', name: 'Pétrus', vintage: null, bottleSize: '75cl' },
      ] as never);

      const result = await service.findDuplicateCandidate({
        category: 'wine', producer: 'Château Pétrus', name: 'Pétrus', vintage: 2015, bottleSize: '75cl',
      } as never);

      expect(result).toMatchObject({ id: 'existing' });
    });

    it('compares format (not vintage) for cigars', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        { id: 'existing', category: 'cigar', producer: 'Romeo y Julieta', name: 'Churchill', format: 'Churchill' },
      ] as never);

      const matching = await service.findDuplicateCandidate({
        category: 'cigar', producer: 'Romeo y Julieta', name: 'Churchill', format: 'Churchill',
      } as never);
      const nonMatching = await service.findDuplicateCandidate({
        category: 'cigar', producer: 'Romeo y Julieta', name: 'Churchill', format: 'Robusto',
      } as never);

      expect(matching).toMatchObject({ id: 'existing' });
      expect(nonMatching).toBeNull();
    });

    it('returns null without querying when producer or name is missing', async () => {
      const result = await service.findDuplicateCandidate({ category: 'wine' } as never);
      expect(result).toBeNull();
      expect(prisma.inventoryItem.findMany).not.toHaveBeenCalled();
    });
  });

  // ISSUE_096: a purged item's local photo must be deleted from disk too —
  // only when it's actually local (uploads/products/*), never an external URL.
  describe('purgeTrashed', () => {
    it('only returns the local photo paths among the purged items', async () => {
      vi.mocked(prisma.inventoryItem.findMany)
        .mockResolvedValueOnce([
          { id: 'a', photoUrl: '/uploads/products/a.jpg', productId: 'pa' },
          { id: 'b', photoUrl: 'https://example.com/b.jpg', productId: 'pb' },
          { id: 'c', photoUrl: null, productId: 'pc' },
        ] as never)
        .mockResolvedValueOnce([] as never); // no remaining unit references a.jpg
      vi.mocked(prisma.inventoryItem.deleteMany).mockResolvedValue({ count: 3 } as never);

      const result = await service.purgeTrashed();

      expect(result).toEqual({ count: 3, photoPaths: ['/uploads/products/a.jpg'] });
      expect(prisma.inventoryItem.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['a', 'b', 'c'] } } });
    });

    // #471 (F1 review): the family keeps the photo; purging one unit must not delete it.
    it('keeps a photo still referenced by a family or by another unit', async () => {
      vi.mocked(prisma.inventoryItem.findMany)
        .mockResolvedValueOnce([
          { id: 'a', photoUrl: '/uploads/products/family.jpg', productId: 'p1' },
          { id: 'b', photoUrl: '/uploads/products/sibling.jpg', productId: 'p2' },
          { id: 'c', photoUrl: '/uploads/products/gone.jpg', productId: 'p3' },
        ] as never)
        .mockResolvedValueOnce([{ photoUrl: '/uploads/products/sibling.jpg' }] as never);
      vi.mocked(prisma.product.findMany)
        .mockResolvedValueOnce([] as never) // no family emptied
        .mockResolvedValueOnce([{ photoUrl: null, otherPhotoUrls: ['/uploads/products/family.jpg'] }] as never);
      vi.mocked(prisma.inventoryItem.deleteMany).mockResolvedValue({ count: 3 } as never);

      const result = await service.purgeTrashed();

      expect(result.photoPaths).toEqual(['/uploads/products/gone.jpg']);
      expect(prisma.product.deleteMany).not.toHaveBeenCalled();
    });

    // QP1: a family left without units goes with them, unless a tasting keeps it.
    it('purges the families left without any unit and without tastings, with their photos', async () => {
      vi.mocked(prisma.inventoryItem.findMany)
        .mockResolvedValueOnce([
          { id: 'a', photoUrl: null, productId: 'p1' },
          { id: 'b', photoUrl: null, productId: 'p1' },
          { id: 'c', photoUrl: null, productId: 'p2' },
        ] as never)
        .mockResolvedValueOnce([] as never);
      vi.mocked(prisma.product.findMany)
        .mockResolvedValueOnce([{ id: 'p1', photoUrl: '/uploads/products/p1.jpg', otherPhotoUrls: ['/uploads/products/p1-old.jpg'] }] as never)
        .mockResolvedValueOnce([] as never);
      vi.mocked(prisma.inventoryItem.deleteMany).mockResolvedValue({ count: 3 } as never);

      const result = await service.purgeTrashed();

      const where = vi.mocked(prisma.product.findMany).mock.calls[0][0]!.where as Record<string, unknown>;
      expect(where).toMatchObject({ items: { none: {} } });
      expect(where.OR).toEqual([
        // QP1: emptied by this purge (and not in the trash themselves), without tastings…
        { id: { in: ['p1', 'p2'] }, deletedAt: null, tastingNotes: { none: {} } },
        // …QP7: or trashed themselves past the retention, tastings or not.
        { deletedAt: { lt: expect.any(Date) } },
      ]);
      expect(prisma.product.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['p1'] } } });
      expect(result.photoPaths).toEqual(['/uploads/products/p1.jpg', '/uploads/products/p1-old.jpg']);
    });

    // QP7: a wine the member put in the trash himself is erased with its
    // tastings — they would otherwise outlive it (`productId` is SET NULL).
    it('deletes the tastings of the families it purges, before them', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);
      vi.mocked(prisma.product.findMany).mockResolvedValueOnce([{ id: 'p9', photoUrl: null, otherPhotoUrls: [] }] as never);

      await service.purgeTrashed();

      expect(prisma.tastingNote.deleteMany).toHaveBeenCalledWith({ where: { productId: { in: ['p9'] } } });
      expect(vi.mocked(prisma.tastingNote.deleteMany).mock.invocationCallOrder[0])
        .toBeLessThan(vi.mocked(prisma.product.deleteMany).mock.invocationCallOrder[0]);
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
    });

    // #471 (F2 review): the startup purge passes no client — it must still be
    // one transaction, or a crash between the two deletes strands empty families.
    it('runs in its own transaction when no client is given', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

      await service.purgeTrashed();

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("joins the caller's transaction when given one", async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

      await service.purgeTrashed(prisma);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('does nothing when nothing is past the retention window', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

      const result = await service.purgeTrashed();

      expect(result).toEqual({ count: 0, photoPaths: [] });
      expect(prisma.inventoryItem.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('deletePhotoFiles', () => {
    beforeEach(() => fsUnlink.mockReset());

    it('deletes every given path and ignores a file already gone', async () => {
      fsUnlink.mockResolvedValueOnce(undefined).mockRejectedValueOnce(
        Object.assign(new Error('gone'), { code: 'ENOENT' }),
      );

      await service.deletePhotoFiles(['/uploads/products/a.jpg', '/uploads/products/b.jpg']);

      expect(fsUnlink).toHaveBeenCalledTimes(2);
    });
  });

  describe('sweepOrphanProductPhotos', () => {
    beforeEach(() => {
      fsReaddir.mockReset();
      fsUnlink.mockReset().mockResolvedValue(undefined);
    });

    it('deletes a file on disk that no item references any more', async () => {
      fsReaddir.mockResolvedValue(['referenced.jpg', 'orphan.jpg', 'family.jpg', 'merged.jpg']);
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        { photoUrl: '/uploads/products/referenced.jpg' },
      ] as never);
      // #471: a family's photo and other photos are references too.
      vi.mocked(prisma.product.findMany).mockResolvedValue([
        { photoUrl: '/uploads/products/family.jpg', otherPhotoUrls: ['/uploads/products/merged.jpg'] },
      ] as never);

      const count = await service.sweepOrphanProductPhotos();

      expect(count).toBe(1);
      expect(fsUnlink).toHaveBeenCalledTimes(1);
      expect(fsUnlink.mock.calls[0][0]).toContain('orphan.jpg');
    });

    it('returns 0 without touching the database when the upload dir does not exist', async () => {
      fsReaddir.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));

      const count = await service.sweepOrphanProductPhotos();

      expect(count).toBe(0);
      expect(prisma.inventoryItem.findMany).not.toHaveBeenCalled();
    });
  });

  // #471 (FEAT-92/94): every unit belongs to a family, created with it.
  describe('createItem', () => {
    const wine = {
      category: 'wine', name: 'Talbot', producer: 'Château Talbot', vintage: 2015, region: 'Bordeaux',
      notes: 'Gift', tags: ['gift'], purchasePrice: 20, cellarId: 'c1', bottleSize: '75cl',
      grapeVarieties: [], isOwned: true, isOpened: false, alertStatus: 'none', lockedFields: [],
    };
    const created = () => vi.mocked(prisma.inventoryItem.create).mock.calls[0]?.[0]?.data as Record<string, any>;

    beforeEach(() => {
      vi.mocked(prisma.inventoryItem.create).mockResolvedValue(unitRow({ id: 'i1' }) as never);
    });

    it('creates the family in the same write, with the description and the creator', async () => {
      await service.createItem('u1', wine as never);

      const product = created().product.create;
      expect(product).toMatchObject({
        userId: 'u1', category: 'wine', name: 'Talbot', producer: 'Château Talbot', vintage: 2015,
        region: 'Bordeaux', notes: 'Gift', tags: ['gift'], alertStatus: 'none',
      });
      expect(product).not.toHaveProperty('purchasePrice');
      expect(product).not.toHaveProperty('cellarId');
      expect(product).not.toHaveProperty('bottleSize');
      expect(product).not.toHaveProperty('isOwned');
    });

    it('keeps writing the unit\'s own columns and the transitional description mirror', async () => {
      await service.createItem('u1', wine as never);

      expect(created()).toMatchObject({
        name: 'Talbot', region: 'Bordeaux', purchasePrice: 20, bottleSize: '75cl',
        user: { connect: { id: 'u1' } }, cellar: { connect: { id: 'c1' } },
      });
      expect(created()).not.toHaveProperty('userId');
      expect(created()).not.toHaveProperty('cellarId');
    });

    it('creates a unit without a cellar', async () => {
      await service.createItem('u1', { ...wine, cellarId: null } as never);

      expect(created()).not.toHaveProperty('cellar');
    });

    it('dates the purchase today when none is given (D6)', async () => {
      await service.createItem('u1', wine as never);

      const purchasedAt = created().purchasedAt as Date;
      const now = new Date();
      expect(purchasedAt.toISOString().slice(0, 10)).toBe(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
      );
    });

    // #471 (FEAT-92 c1, lot E1): one family and one group of N bottles.
    it('creates one group of the number of bottles given, never on the family', async () => {
      await service.createItem('u1', { ...wine, quantity: 6 } as never);

      expect(created().quantity).toBe(6);
      expect(created().product.create).not.toHaveProperty('quantity');
    });

    // #471 (FEAT-95 c1-c2): a cigar group is N boxes of M cigars, or N single cigars.
    it('creates a group of closed boxes, the box size on the unit only', async () => {
      const cigar = { category: 'cigar', name: 'Robusto', producer: 'Partagás', format: 'Robusto', tags: [], isOwned: true, isOpened: false, alertStatus: 'none', lockedFields: [] };
      await service.createItem('u1', { ...cigar, quantity: 3, cigarsPerBox: 25, purchasePrice: 200 } as never);

      expect(created()).toMatchObject({ quantity: 3, cigarsPerBox: 25, purchasePrice: 200 });
      expect(created().product.create).toMatchObject({ category: 'cigar', format: 'Robusto' });
      expect(created().product.create).not.toHaveProperty('cigarsPerBox');
      expect(created().product.create).not.toHaveProperty('quantity');
    });

    it('creates one opened box with the cigars left in it', async () => {
      const cigar = { category: 'cigar', name: 'Robusto', producer: 'Partagás', tags: [], isOwned: true, alertStatus: 'none', lockedFields: [] };
      await service.createItem('u1', { ...cigar, quantity: 1, cigarsPerBox: 25, isOpened: true, cigarsLeft: 10 } as never);

      expect(created()).toMatchObject({ quantity: 1, cigarsPerBox: 25, isOpened: true, cigarsLeft: 10 });
      expect(created().product.create).not.toHaveProperty('cigarsLeft');
    });

    it('dates the purchase on the day given, as midnight UTC (D6)', async () => {
      await service.createItem('u1', { ...wine, purchasedAt: '2026-01-15' } as never);

      expect(created().purchasedAt).toEqual(new Date('2026-01-15T00:00:00.000Z'));
      expect(created().product.create).not.toHaveProperty('purchasedAt');
    });

    it('stores no purchase day when it was emptied', async () => {
      await service.createItem('u1', { ...wine, purchasedAt: null } as never);

      expect(created().purchasedAt).toBeNull();
    });

    it('answers the purchase day as YYYY-MM-DD, never as a time (D6)', async () => {
      vi.mocked(prisma.inventoryItem.create).mockResolvedValue(
        unitRow({ id: 'i1', purchasedAt: new Date('2026-01-15T00:00:00.000Z') }) as never,
      );

      const view = await service.createItem('u1', wine as never);

      expect(view.purchasedAt).toBe('2026-01-15');
    });

    it('splits field sources and locks between the family and the unit', async () => {
      await service.createItem(
        'u1', { ...wine, lockedFields: ['name', 'purchasePrice'] } as never, undefined,
        { name: 'import_csv', purchasePrice: 'import_csv' },
      );

      expect(created().product.create).toMatchObject({
        fieldSources: { name: 'import_csv' }, lockedFields: ['name'],
      });
      expect(created().fieldSources).toEqual({ name: 'import_csv', purchasePrice: 'import_csv' });
    });
  });
});
