import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    collection: {
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    inventoryItem: { findMany: vi.fn(), findUnique: vi.fn() },
    product: { findMany: vi.fn() },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { collectionsService } from '../../src/services/collections.service';

/** A collection row as read with its families and their units. */
const collectionRow = (products: { id: string; items: { id: string }[] }[] = []) =>
  ({ id: 'c1', userId: 'u1', name: 'Fêtes', color: '#6366f1', icon: null, products });

const updateData = () =>
  (vi.mocked(prisma.collection.update).mock.calls[0][0] as unknown as { data: Record<string, unknown> }).data;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.collection.findFirst).mockResolvedValue({ id: 'c1', userId: 'u1' } as never);
  vi.mocked(prisma.collection.update).mockResolvedValue(collectionRow() as never);
  vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.product.findMany).mockResolvedValue([] as never);
});

// #476: collections are shared by the household like the rest of the
// inventory. `userId` is who created one, never an access filter: any member
// opens, fills, renames and deletes any collection.
describe('collectionsService — shared by the household (#476)', () => {
  it('lists every member\'s collections', async () => {
    vi.mocked(prisma.collection.findMany).mockResolvedValue([] as never);

    await collectionsService.list();

    expect(vi.mocked(prisma.collection.findMany).mock.calls[0][0]!.where).toBeUndefined();
  });

  it('keeps who created a collection', async () => {
    vi.mocked(prisma.collection.create).mockResolvedValue(collectionRow() as never);

    await collectionsService.create('u2', { name: 'Gifts', color: '#6366f1' });

    expect(vi.mocked(prisma.collection.create).mock.calls[0][0]!.data).toMatchObject({ name: 'Gifts', userId: 'u2' });
  });

  it('lets a member change a collection someone else created', async () => {
    vi.mocked(prisma.collection.findFirst).mockResolvedValue({ id: 'c1', userId: 'someone-else' } as never);
    vi.mocked(prisma.collection.delete).mockResolvedValue({ id: 'c1' } as never);

    expect(await collectionsService.update('c1', { name: 'x' })).not.toBeNull();
    expect(await collectionsService.addProducts('c1', { productIds: ['p1'] })).not.toBeNull();
    expect(await collectionsService.removeProduct('c1', 'p1')).not.toBeNull();
    expect(await collectionsService.delete('c1')).not.toBeNull();

    for (const [args] of vi.mocked(prisma.collection.findFirst).mock.calls) {
      expect(args).toEqual({ where: { id: 'c1' } });
    }
  });

  it('every mutating method returns null for an unknown collection', async () => {
    vi.mocked(prisma.collection.findFirst).mockResolvedValue(null);

    expect(await collectionsService.update('c1', { name: 'x' })).toBeNull();
    expect(await collectionsService.delete('c1')).toBeNull();
    expect(await collectionsService.addProducts('c1', { itemIds: ['i1'] })).toBeNull();
    expect(await collectionsService.removeItem('c1', 'i1')).toBeNull();
    expect(await collectionsService.removeProduct('c1', 'p1')).toBeNull();

    expect(prisma.collection.update).not.toHaveBeenCalled();
    expect(prisma.collection.delete).not.toHaveBeenCalled();
  });
});

// #471 (F2 review): a collection holds families. Linking units too (the
// former `_CollectionItems`) left the other bottles of a wine behind when one
// of them was taken out — nothing writes or reads that link any more.
describe('collectionsService — a collection of families (#471)', () => {
  it('lists its families out of the trash, and their units for the readers still counting bottles', async () => {
    vi.mocked(prisma.collection.findMany).mockResolvedValue([
      collectionRow([{ id: 'p1', items: [{ id: 'i1' }, { id: 'i2' }] }, { id: 'p2', items: [] }]),
    ] as never);

    const [collection] = await collectionsService.list();

    expect(collection).toMatchObject({ id: 'c1', products: [{ id: 'p1' }, { id: 'p2' }], items: [{ id: 'i1' }, { id: 'i2' }] });
    const include = vi.mocked(prisma.collection.findMany).mock.calls[0][0]!.include as Record<string, unknown>;
    expect(include).toEqual({
      products: {
        where: { deletedAt: null },
        select: { id: true, items: { where: { deletedAt: null }, select: { id: true } } },
      },
    });
  });

  it('adds the families of the units named by the readers not migrated yet (itemIds)', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([{ productId: 'p1' }, { productId: 'p1' }] as never);

    await collectionsService.addProducts('c1', { itemIds: ['i1', 'i2', 'gone'] });

    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['i1', 'i2', 'gone'] }, deletedAt: null },
      select: { productId: true },
    });
    expect(updateData()).toEqual({ products: { connect: [{ id: 'p1' }] } });
  });

  it('adds families named directly, ignoring unknown or trashed ones', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([{ id: 'p2' }] as never);

    await collectionsService.addProducts('c1', { productIds: ['p2', 'trashed'] });

    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['p2', 'trashed'] }, deletedAt: null },
      select: { id: true },
    });
    expect(prisma.inventoryItem.findMany).not.toHaveBeenCalled();
    expect(updateData()).toEqual({ products: { connect: [{ id: 'p2' }] } });
  });

  it('takes the whole family out when a reader names one of its units', async () => {
    vi.mocked(prisma.inventoryItem.findUnique).mockResolvedValue({ productId: 'p1' } as never);

    await collectionsService.removeItem('c1', 'i1');

    expect(updateData()).toEqual({ products: { disconnect: { id: 'p1' } } });
  });

  it('leaves the collection as it is for an unknown unit', async () => {
    vi.mocked(prisma.inventoryItem.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.collection.findFirstOrThrow).mockResolvedValue(collectionRow() as never);

    const collection = await collectionsService.removeItem('c1', 'nope');

    expect(prisma.collection.update).not.toHaveBeenCalled();
    expect(collection).toMatchObject({ id: 'c1', products: [], items: [] });
  });

  it('takes a family out by its id', async () => {
    await collectionsService.removeProduct('c1', 'p1');

    expect(updateData()).toEqual({ products: { disconnect: { id: 'p1' } } });
  });
});

describe('collectionsService.delete', () => {
  it('deletes the row; its links go with it (ON DELETE CASCADE)', async () => {
    vi.mocked(prisma.collection.delete).mockResolvedValue({ id: 'c1' } as never);

    await collectionsService.delete('c1');

    expect(prisma.collection.update).not.toHaveBeenCalled();
    expect(prisma.collection.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });
});
