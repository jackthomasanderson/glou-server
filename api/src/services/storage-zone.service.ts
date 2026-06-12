import { prisma } from '../lib/prisma';
import { CreateStorageZoneInput, UpdateStorageZoneInput } from '../schemas/storage-zone.schema';

export class StorageZoneService {
  /**
   * List all storage zones for a cellar, as a flat list with children nested.
   */
  static async listByCellar(cellarId: string) {
    const zones = await prisma.storageZone.findMany({
      where: { cellarId },
      include: {
        _count: { select: { items: { where: { deletedAt: null } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return zones;
  }

  /**
   * Get a single storage zone with its item count.
   */
  static async getById(zoneId: string) {
    return prisma.storageZone.findUnique({
      where: { id: zoneId },
      include: {
        _count: { select: { items: { where: { deletedAt: null } } } },
        children: {
          include: {
            _count: { select: { items: { where: { deletedAt: null } } } },
          },
        },
      },
    });
  }

  /**
   * Create a new storage zone for a given cellar.
   * Validates that parentId (if provided) belongs to the same cellar.
   */
  static async createZone(cellarId: string, data: CreateStorageZoneInput) {
    if (data.parentId) {
      const parent = await prisma.storageZone.findFirst({
        where: { id: data.parentId, cellarId },
      });
      if (!parent) {
        throw new Error('PARENT_ZONE_NOT_FOUND');
      }
    }

    return prisma.storageZone.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        capacity: data.capacity ?? null,
        parentId: data.parentId ?? null,
        cellarId,
      },
    });
  }

  /**
   * Update a storage zone. Re-validates parentId if changed.
   */
  static async updateZone(zoneId: string, data: UpdateStorageZoneInput) {
    const zone = await prisma.storageZone.findUnique({ where: { id: zoneId } });
    if (!zone) return null;

    if (data.parentId !== undefined && data.parentId !== null) {
      // Prevent circular references: the new parent must not be a descendant
      if (data.parentId === zoneId) throw new Error('CIRCULAR_REFERENCE');
      const descendantIds = await StorageZoneService.getAllDescendantIds(zoneId);
      if (descendantIds.includes(data.parentId)) throw new Error('CIRCULAR_REFERENCE');

      const parent = await prisma.storageZone.findFirst({
        where: { id: data.parentId, cellarId: zone.cellarId },
      });
      if (!parent) throw new Error('PARENT_ZONE_NOT_FOUND');
    }

    return prisma.storageZone.update({
      where: { id: zoneId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
        ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
      },
    });
  }

  /**
   * Delete a zone.
   * - If it has direct children, refuse (ZONE_HAS_CHILDREN).
   * - If it has items, redirect them to unclassified (storageZoneId = null) before deletion.
   */
  static async deleteZone(zoneId: string) {
    const zone = await prisma.storageZone.findUnique({
      where: { id: zoneId },
      include: {
        _count: { select: { children: true, items: { where: { deletedAt: null } } } },
      },
    });
    if (!zone) return null;

    if (zone._count.children > 0) {
      throw new Error('ZONE_HAS_CHILDREN');
    }

    // Redirect items to unclassified
    if (zone._count.items > 0) {
      await prisma.inventoryItem.updateMany({
        where: { storageZoneId: zoneId, deletedAt: null },
        data: { storageZoneId: null },
      });
    }

    return prisma.storageZone.delete({ where: { id: zoneId } });
  }

  /**
   * List all items in a zone AND all descendant zones (recursive).
   */
  static async listItemsByZone(zoneId: string) {
    const allZoneIds = [zoneId, ...(await StorageZoneService.getAllDescendantIds(zoneId))];
    return prisma.inventoryItem.findMany({
      where: { storageZoneId: { in: allZoneIds }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Recursively collect all descendant zone IDs for a given zone.
   */
  static async getAllDescendantIds(zoneId: string): Promise<string[]> {
    const children = await prisma.storageZone.findMany({
      where: { parentId: zoneId },
      select: { id: true },
    });
    if (children.length === 0) return [];
    const childIds = children.map((c) => c.id);
    const deeper = await Promise.all(childIds.map((id) => StorageZoneService.getAllDescendantIds(id)));
    return [...childIds, ...deeper.flat()];
  }
}
