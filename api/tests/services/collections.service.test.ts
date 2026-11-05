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

describe('collectionsService ownership guards', () => {
  it('every mutating method returns null when the collection is not owned by the caller', async () => {
    vi.mocked(prisma.collection.findFirst).mockResolvedValue(null);

    expect(await collectionsService.update('c1', 'u1', { name: 'x' })).toBeNull();
    expect(await collectionsService.delete('c1', 'u1')).toBeNull();
    expect(await collectionsService.addProducts('c1', 'u1', { itemIds: ['i1'] })).toBeNull();
    expect(await collectionsService.removeItem('c1', 'u1', 'i1')).toBeNull();
    expect(await collectionsService.removeProduct('c1', 'u1', 'p1')).toBeNull();

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

    const [collection] = await collectionsService.list('u1');

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

    await collectionsService.addProducts('c1', 'u1', { itemIds: ['i1', 'i2', 'gone'] });

    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['i1', 'i2', 'gone'] }, deletedAt: null },
      select: { productId: true },
    });
    expect(updateData()).toEqual({ products: { connect: [{ id: 'p1' }] } });
  });

  it('adds families named directly, ignoring unknown or trashed ones', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([{ id: 'p2' }] as never);

    await collectionsService.addProducts('c1', 'u1', { productIds: ['p2', 'trashed'] });

    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['p2', 'trashed'] }, deletedAt: null },
      select: { id: true },
    });
    expect(prisma.inventoryItem.findMany).not.toHaveBeenCalled();
    expect(updateData()).toEqual({ products: { connect: [{ id: 'p2' }] } });
  });

  it('takes the whole family out when a reader names one of its units', async () => {
    vi.mocked(prisma.inventoryItem.findUnique).mockResolvedValue({ productId: 'p1' } as never);

    await collectionsService.removeItem('c1', 'u1', 'i1');

    expect(updateData()).toEqual({ products: { disconnect: { id: 'p1' } } });
  });

  it('leaves the collection as it is for an unknown unit', async () => {
    vi.mocked(prisma.inventoryItem.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.collection.findFirstOrThrow).mockResolvedValue(collectionRow() as never);

    const collection = await collectionsService.removeItem('c1', 'u1', 'nope');

    expect(prisma.collection.update).not.toHaveBeenCalled();
    expect(collection).toMatchObject({ id: 'c1', products: [], items: [] });
  });

  it('takes a family out by its id', async () => {
    await collectionsService.removeProduct('c1', 'u1', 'p1');

    expect(updateData()).toEqual({ products: { disconnect: { id: 'p1' } } });
  });
});

describe('collectionsService.delete', () => {
  it('deletes the row; its links go with it (ON DELETE CASCADE)', async () => {
    vi.mocked(prisma.collection.delete).mockResolvedValue({ id: 'c1' } as never);

    await collectionsService.delete('c1', 'u1');

    expect(prisma.collection.update).not.toHaveBeenCalled();
    expect(prisma.collection.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });
});
