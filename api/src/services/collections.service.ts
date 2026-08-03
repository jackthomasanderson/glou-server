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
      select: { id: true },
    });
    return prisma.collection.update({
      where: { id },
      data: { items: { connect: availableItems.map((item) => ({ id: item.id })) } },
      include: { items: { select: { id: true }, where: { deletedAt: null } } },
    });
  },

  async removeItem(id: string, userId: string, itemId: string) {
    const existing = await prisma.collection.findFirst({ where: { id, userId } });
    if (!existing) return null;
    return prisma.collection.update({
      where: { id },
      data: { items: { disconnect: { id: itemId } } },
      include: { items: { select: { id: true }, where: { deletedAt: null } } },
    });
  },
};
