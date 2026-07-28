import { prisma } from '../lib/prisma';
import { InventoryPatch, InventoryInput } from '../schemas/inventory.schema';
import { computeAlertStatus } from './alert.service';
import { v4 as uuidv4 } from 'uuid';

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface InventoryHistoryEntry {
  id: number;
  action: string;
  status: string;
  actorId: string;
  actorName: string;
  changes: FieldChange[] | null;
  createdAt: Date;
}

export interface InventoryWithTraceability {
  item: Record<string, unknown>;
  creator: { id: string; name: string } | null;
  lastEditor: { id: string; name: string } | null;
}

// InventoryItem type inferred from Prisma client
type InventoryItem = Awaited<ReturnType<typeof prisma.inventoryItem.findFirst>> extends infer T | null ? NonNullable<T> : never;

const INVENTORY_COLLECTIONS_INCLUDE = {
  collections: { select: { id: true, name: true, color: true, icon: true } },
};

async function findInventoryItemWithCollections(id: string) {
  return prisma.inventoryItem.findFirst({
    where: { id, deletedAt: null },
    include: INVENTORY_COLLECTIONS_INCLUDE,
  });
}

type InventoryItemWithCollections = NonNullable<Awaited<ReturnType<typeof findInventoryItemWithCollections>>>;

function getJsonField<T>(json: unknown, field: string): T | undefined {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return undefined;
  }

  const jsonObject = json as Record<string, unknown>;
  if (!(field in jsonObject)) {
    return undefined;
  }

  return jsonObject[field] as T;
}


/** Corbeille : 7 jours avant purge définitive */
const TRASH_RETENTION_DAYS = 7;

export class InventoryService {
  async listInventory(_userId: string): Promise<InventoryItemWithCollections[]> {
    return prisma.inventoryItem.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: INVENTORY_COLLECTIONS_INCLUDE,
    });
  }

  async listTrash(_userId: string): Promise<InventoryItem[]> {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    return prisma.inventoryItem.findMany({
      where: {
        deletedAt: { not: null, gte: cutoff },
      },
      orderBy: { deletedAt: 'desc' },
    });
  }

  async getItem(_userId: string, id: string): Promise<InventoryItemWithCollections | null> {
    return findInventoryItemWithCollections(id);
  }

  async getItemWithTraceability(_userId: string, id: string): Promise<InventoryWithTraceability | null> {
    const item = await prisma.inventoryItem.findFirst({ where: { id, deletedAt: null } });
    if (!item) return null;

    const uniqueIds = [...new Set([item.userId, item.updatedBy].filter((id): id is string => Boolean(id)))];
    const users = await prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, displayName: true, username: true },
    });
    const userMap = new Map(users.map((u: { id: string; displayName: string | null; username: string }) => [u.id, u.displayName ?? u.username]));

    const creator = item.userId ? { id: item.userId, name: userMap.get(item.userId) ?? item.userId } : null;
    const updatedById = item.updatedBy;
    const lastEditor = updatedById ? { id: updatedById, name: userMap.get(updatedById) ?? updatedById } : null;

    return { item, creator, lastEditor };
  }

  async getItemHistory(id: string): Promise<InventoryHistoryEntry[]> {
    const logs = await prisma.auditLog.findMany({
      where: {
        bottleId: id,
        action: { in: ['CREATE', 'UPDATE', 'DELETE', 'RESTORE'] },
        status: 'success',
      },
      orderBy: { createdAt: 'desc' },
    });

    const uniqueUserIds = [...new Set(logs.map((l: { userId: string }) => l.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: uniqueUserIds } },
      select: { id: true, displayName: true, username: true },
    });
    const userMap = new Map(users.map((u: { id: string; displayName: string | null; username: string }) => [u.id, u.displayName ?? u.username]));

    return logs.map((log: { id: number; action: string; status: string; userId: string; details: unknown; createdAt: Date }) => ({
      id: log.id,
      action: log.action,
      status: log.status,
      actorId: log.userId,
      actorName: userMap.get(log.userId) ?? log.userId,
      changes: getJsonField<FieldChange[] | null>(log.details, 'changes') ?? null,
      createdAt: log.createdAt,
    }));
  }

  async createItem(userId: string, data: InventoryInput): Promise<InventoryItem> {
    const patch = this.toPatch(data);
    const dbData = this.mapInputToDb(patch);
    const alertStatus = computeAlertStatus(
      patch.peakMaturityFrom ?? undefined,
      patch.peakMaturityTo ?? undefined,
    );
    return prisma.inventoryItem.create({
      data: { id: uuidv4(), userId, ...dbData, alertStatus } as never,
    });
  }

  async updateItem(
    userId: string,
    id: string,
    patch: InventoryPatch
  ): Promise<{ item: InventoryItem; changes: FieldChange[]; slotConflict?: boolean } | null> {
    const existing = await prisma.inventoryItem.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return null;

    // Slot uniqueness: if assigning a grid slot, verify it is not occupied by another item
    const targetCellarId = 'cellarId' in patch ? patch.cellarId : existing.cellarId;
    const targetSlotColumn = 'slotColumn' in patch ? patch.slotColumn : existing.slotColumn;
    const targetSlotRow = 'slotRow' in patch ? patch.slotRow : existing.slotRow;

    if (targetCellarId && targetSlotColumn != null && targetSlotRow != null) {
      const conflict = await prisma.inventoryItem.findFirst({
        where: {
          cellarId: targetCellarId,
          slotColumn: targetSlotColumn,
          slotRow: targetSlotRow,
          id: { not: id },
          deletedAt: null,
        },
      });
      if (conflict) return { item: existing, changes: [], slotConflict: true };
    }

    const safePatch = Object.fromEntries(
      Object.entries(patch).filter(([key]) => !existing.lockedFields.includes(key))
    ) as InventoryPatch;

    const changes: FieldChange[] = Object.entries(safePatch)
      .filter(([key, val]) => {
        const existingVal = this.getInventoryField(existing, key);
        return JSON.stringify(existingVal) !== JSON.stringify(val);
      })
      .map(([key, val]) => ({
        field: key,
        from: this.getInventoryField(existing, key),
        to: val,
      }));

    const dbData = this.mapInputToDb(safePatch);

    const from = ('peakMaturityFrom' in safePatch ? safePatch.peakMaturityFrom : existing.peakMaturityFrom) as number | null | undefined;
    const to = ('peakMaturityTo' in safePatch ? safePatch.peakMaturityTo : existing.peakMaturityTo) as number | null | undefined;
    const alertStatus = computeAlertStatus(from, to);

    const item = await prisma.inventoryItem.update({
      where: { id },
      data: { ...dbData, alertStatus, updatedAt: new Date(), updatedBy: userId } as never,
    });

    return { item, changes };
  }

  async bulkUpdate(
    userId: string,
    ids: string[],
    patch: InventoryPatch
  ): Promise<number> {
    const existing = await prisma.inventoryItem.findMany({
      where: { id: { in: ids }, deletedAt: null },
    });

    if (existing.length === 0) return 0;

    let updatedCount = 0;
    await prisma.$transaction(async (tx: typeof prisma) => {
      for (const item of existing) {
        const safePatch = Object.fromEntries(
          Object.entries(patch).filter(([key]) => !item.lockedFields.includes(key))
        );
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: {
            ...this.mapInputToDb(safePatch as InventoryPatch),
            updatedAt: new Date(),
            updatedBy: userId,
          } as never,
        });
        updatedCount++;
      }
    });

    return updatedCount;
  }

  async softDelete(_userId: string, id: string): Promise<InventoryItem | null> {
    const existing = await prisma.inventoryItem.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return null;

    return prisma.inventoryItem.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async restore(_userId: string, id: string): Promise<InventoryItem | null> {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const existing = await prisma.inventoryItem.findFirst({
      where: {
        id,
        deletedAt: { not: null, gte: cutoff },
      },
    });
    if (!existing) return null;

    return prisma.inventoryItem.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  async purgeTrashed(): Promise<number> {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await prisma.inventoryItem.deleteMany({
      where: { deletedAt: { lt: cutoff } },
    });
    return result.count;
  }

  daysUntilPermanentDelete(deletedAt: Date): number {
    const expiresAt = new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const remaining = Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    return Math.max(0, remaining);
  }

  private mapInputToDb(data: Partial<InventoryPatch>): Partial<InventoryPatch> {
    return Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined)
    ) as Partial<InventoryPatch>;
  }

  private toPatch(input: InventoryInput): InventoryPatch {
    return {
      category: input.category,
      name: input.name,
      producer: input.producer,
      location: input.location,
      collection: input.collection,
      tags: input.tags,
      photoUrl: input.photoUrl,
      notes: input.notes,
      purchasePrice: input.purchasePrice,
      purchasePlace: input.purchasePlace,
      estimatedValue: input.estimatedValue,
      isOpened: input.isOpened,
      fillLevel: input.fillLevel,
      openedAt: input.openedAt,
      reminderDate: input.reminderDate,
      alertStatus: input.alertStatus,
      cellarId: input.cellarId,
      lockedFields: input.lockedFields,
      vintage: 'vintage' in input ? input.vintage : undefined,
      color: 'color' in input ? input.color : undefined,
      region: 'region' in input ? input.region : undefined,
      grapeVarieties: 'grapeVarieties' in input ? input.grapeVarieties : undefined,
      alcoholDegree: 'alcoholDegree' in input ? input.alcoholDegree : undefined,
      bottleSize: 'bottleSize' in input ? input.bottleSize : undefined,
      peakMaturityFrom: 'peakMaturityFrom' in input ? input.peakMaturityFrom : undefined,
      peakMaturityTo: 'peakMaturityTo' in input ? input.peakMaturityTo : undefined,
      needsAeration: 'needsAeration' in input ? input.needsAeration : undefined,
      serviceTemp: 'serviceTemp' in input ? input.serviceTemp : undefined,
      lotNumber: 'lotNumber' in input ? input.lotNumber : undefined,
      sparklingType: 'sparklingType' in input ? input.sparklingType : undefined,
      sugarLevel: 'sugarLevel' in input ? input.sugarLevel : undefined,
      disgorgingDate: 'disgorgingDate' in input ? input.disgorgingDate : undefined,
      baseYear: 'baseYear' in input ? input.baseYear : undefined,
      spiritType: 'spiritType' in input ? input.spiritType : undefined,
      edition: 'edition' in input ? input.edition : undefined,
      declaredAge: 'declaredAge' in input ? input.declaredAge : undefined,
      caskType: 'caskType' in input ? input.caskType : undefined,
      additions: 'additions' in input ? input.additions : undefined,
      aromaticProfile: 'aromaticProfile' in input ? input.aromaticProfile : undefined,
      format: 'format' in input ? input.format : undefined,
      quantity: 'quantity' in input ? input.quantity : undefined,
      manufactureYear: 'manufactureYear' in input ? input.manufactureYear : undefined,
      leafOrigin: 'leafOrigin' in input ? input.leafOrigin : undefined,
      factoryCode: 'factoryCode' in input ? input.factoryCode : undefined,
      recommendedHumidity: 'recommendedHumidity' in input ? input.recommendedHumidity : undefined,
      humidificationSystem: 'humidificationSystem' in input ? input.humidificationSystem : undefined,
    };
  }

  private getInventoryField(item: InventoryItem, key: string): unknown {
    if (!(key in item)) {
      return undefined;
    }

    return item[key as keyof InventoryItem];
  }
}

export const inventoryService = new InventoryService();
