import { prisma } from '../lib/prisma';
import { CollectionCreateInput, CollectionPatchInput } from '../schemas/collections.schema';

export const collectionsService = {
  async list(userId: string) {
    return prisma.collection.findMany({
      where: { userId },
      include: {
        items: { select: { id: true }, where: { deletedAt: null } },
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  async create(userId: string, data: CollectionCreateInput) {
    return prisma.collection.create({
      data: { ...data, userId },
      include: {
        items: { select: { id: true } },
      },
    });
  },

  async update(id: string, userId: string, data: CollectionPatchInput) {
    const existing = await prisma.collection.findFirst({ where: { id, userId } });
    if (!existing) return null;
    return prisma.collection.update({
      where: { id },
      data,
      include: { items: { select: { id: true } } },
    });
  },

  async delete(id: string, userId: string) {
    const existing = await prisma.collection.findFirst({ where: { id, userId } });
    if (!existing) return null;
    await prisma.collection.update({
      where: { id },
      data: { items: { set: [] } },
    });
    return prisma.collection.delete({ where: { id } });
  },

  async addItems(id: string, userId: string, itemIds: string[]) {
    // The Collection itself is owned by `userId` (legitimate — collections
    // are per-user groupings), but the items being added come from the
    // shared instance inventory (design.md invariant: userId on
    // InventoryItem is an audit field, not an access filter). Any member's
    // items can be added to any collection they own.
    const existing = await prisma.collection.findFirst({ where: { id, userId } });
    if (!existing) return null;
    const availableItems = await prisma.inventoryItem.findMany({
      where: { id: { in: itemIds }, deletedAt: null },
      select: { id: true, productId: true },
    });
    // #471: a collection holds families (the wine); the units stay linked as
    // the transitional mirror still read by the item routes.
    const productIds = [...new Set(availableItems.map((item) => item.productId))];
    return prisma.collection.update({
      where: { id },
      data: {
        items: { connect: availableItems.map((item) => ({ id: item.id })) },
        products: { connect: productIds.map((productId) => ({ id: productId })) },
      },
      include: { items: { select: { id: true }, where: { deletedAt: null } } },
    });
  },

  async removeItem(id: string, userId: string, itemId: string) {
    const existing = await prisma.collection.findFirst({ where: { id, userId } });
    if (!existing) return null;
    const item = await prisma.inventoryItem.findUnique({ where: { id: itemId }, select: { productId: true } });
    return prisma.collection.update({
      where: { id },
      data: {
        items: { disconnect: { id: itemId } },
        ...(item ? { products: { disconnect: { id: item.productId } } } : {}),
      },
      include: { items: { select: { id: true }, where: { deletedAt: null } } },
    });
  },
};
