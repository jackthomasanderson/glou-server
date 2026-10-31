import { prisma } from '../lib/prisma';
import { CollectionCreateInput, CollectionPatchInput } from '../schemas/collections.schema';

/**
 * #471: a collection holds families (the wine), not units. `products` lists
 * its families out of the trash; `items` (their units out of the trash) is
 * kept for the readers that still count bottles from it.
 */
const MEMBERS_INCLUDE = {
  products: {
    where: { deletedAt: null },
    select: { id: true, items: { where: { deletedAt: null }, select: { id: true } } },
  },
} as const;

type CollectionRow = Awaited<ReturnType<typeof prisma.collection.findFirstOrThrow<{ include: typeof MEMBERS_INCLUDE }>>>;

function toCollectionView({ products, ...collection }: CollectionRow) {
  return {
    ...collection,
    products: products.map(({ id }) => ({ id })),
    items: products.flatMap((product) => product.items),
  };
}

export type CollectionView = ReturnType<typeof toCollectionView>;

export const collectionsService = {
  async list(userId: string): Promise<CollectionView[]> {
    const rows = await prisma.collection.findMany({
      where: { userId },
      include: MEMBERS_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toCollectionView);
  },

  async create(userId: string, data: CollectionCreateInput): Promise<CollectionView> {
    return toCollectionView(await prisma.collection.create({ data: { ...data, userId }, include: MEMBERS_INCLUDE }));
  },

  async update(id: string, userId: string, data: CollectionPatchInput): Promise<CollectionView | null> {
    const existing = await prisma.collection.findFirst({ where: { id, userId } });
    if (!existing) return null;
    return toCollectionView(await prisma.collection.update({ where: { id }, data, include: MEMBERS_INCLUDE }));
  },

  async delete(id: string, userId: string) {
    const existing = await prisma.collection.findFirst({ where: { id, userId } });
    if (!existing) return null;
    // Its membership rows go with it (ON DELETE CASCADE on the join tables).
    return prisma.collection.delete({ where: { id } });
  },

  /**
   * Adds families to a collection, named directly (`productIds`) or through
   * one of their units (`itemIds`, the readers not migrated yet). The
   * Collection itself is owned by `userId` (collections are per-user
   * groupings), but the families come from the shared instance inventory
   * (design.md: userId on the inventory is an audit field, not an access
   * filter). Unknown or trashed ids are ignored.
   */
  async addProducts(
    id: string,
    userId: string,
    members: { itemIds?: string[]; productIds?: string[] },
  ): Promise<CollectionView | null> {
    const existing = await prisma.collection.findFirst({ where: { id, userId } });
    if (!existing) return null;
    const [units, families] = await Promise.all([
      members.itemIds?.length
        ? prisma.inventoryItem.findMany({ where: { id: { in: members.itemIds }, deletedAt: null }, select: { productId: true } })
        : [],
      members.productIds?.length
        ? prisma.product.findMany({ where: { id: { in: members.productIds }, deletedAt: null }, select: { id: true } })
        : [],
    ]);
    const productIds = [...new Set([...units.map((unit) => unit.productId), ...families.map((family) => family.id)])];
    return toCollectionView(await prisma.collection.update({
      where: { id },
      data: { products: { connect: productIds.map((productId) => ({ id: productId })) } },
      include: MEMBERS_INCLUDE,
    }));
  },

  async removeProduct(id: string, userId: string, productId: string): Promise<CollectionView | null> {
    const existing = await prisma.collection.findFirst({ where: { id, userId } });
    if (!existing) return null;
    return toCollectionView(await prisma.collection.update({
      where: { id },
      data: { products: { disconnect: { id: productId } } },
      include: MEMBERS_INCLUDE,
    }));
  },

  /** Takes a unit's family out of the collection (the readers not migrated yet name a unit). */
  async removeItem(id: string, userId: string, itemId: string): Promise<CollectionView | null> {
    const existing = await prisma.collection.findFirst({ where: { id, userId } });
    if (!existing) return null;
    const unit = await prisma.inventoryItem.findUnique({ where: { id: itemId }, select: { productId: true } });
    if (!unit) return toCollectionView(await prisma.collection.findFirstOrThrow({ where: { id }, include: MEMBERS_INCLUDE }));
    return this.removeProduct(id, userId, unit.productId);
  },
};
