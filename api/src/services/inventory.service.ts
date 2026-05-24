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


/** Corbeille : 7 jours avant purge définitive */
const TRASH_RETENTION_DAYS = 7;

export class InventoryService {
  async listInventory(_userId: string): Promise<InventoryItem[]> {
    return prisma.inventoryItem.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
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

  async getItem(_userId: string, id: string): Promise<InventoryItem | null> {
    return prisma.inventoryItem.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async getItemWithTraceability(_userId: string, id: string): Promise<InventoryWithTraceability | null> {
    const item = await prisma.inventoryItem.findFirst({ where: { id, deletedAt: null } });
    if (!item) return null;

    const uniqueIds = [...new Set([item.userId, (item as unknown as Record<string, unknown>)['updatedBy'] as string | undefined].filter(Boolean))] as string[];
    const users = await prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, displayName: true, username: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.displayName ?? u.username]));

    const creator = item.userId ? { id: item.userId, name: userMap.get(item.userId) ?? item.userId } : null;
    const updatedById = (item as unknown as Record<string, unknown>)['updatedBy'] as string | undefined;
    const lastEditor = updatedById ? { id: updatedById, name: userMap.get(updatedById) ?? updatedById } : null;

    return { item: item as unknown as Record<string, unknown>, creator, lastEditor };
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

    const uniqueUserIds = [...new Set(logs.map((l) => l.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: uniqueUserIds } },
      select: { id: true, displayName: true, username: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.displayName ?? u.username]));

    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      status: log.status,
      actorId: log.userId,
      actorName: userMap.get(log.userId) ?? log.userId,
      changes: (log.details as Record<string, unknown> | null)?.['changes'] as FieldChange[] | null ?? null,
      createdAt: log.createdAt,
    }));
  }

  async createItem(userId: string, data: InventoryInput): Promise<InventoryItem> {
    const patch = data as unknown as InventoryPatch;
    const dbData = this.mapInputToDb(patch);
    const alertStatus = computeAlertStatus(
      (patch as Record<string, unknown>)['peakMaturityFrom'] as number | undefined,
      (patch as Record<string, unknown>)['peakMaturityTo'] as number | undefined,
    );
    return prisma.inventoryItem.create({
      data: { id: uuidv4(), userId, ...dbData, alertStatus } as never,
    });
  }

  async updateItem(
    userId: string,
    id: string,
    patch: InventoryPatch
  ): Promise<{ item: InventoryItem; changes: FieldChange[] } | null> {
    const existing = await prisma.inventoryItem.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return null;

    const safePatch = Object.fromEntries(
      Object.entries(patch).filter(([key]) => !existing.lockedFields.includes(key))
    ) as InventoryPatch;

    const changes: FieldChange[] = Object.entries(safePatch)
      .filter(([key, val]) => {
        const existingVal = (existing as unknown as Record<string, unknown>)[key];
        return JSON.stringify(existingVal) !== JSON.stringify(val);
      })
      .map(([key, val]) => ({
        field: key,
        from: (existing as unknown as Record<string, unknown>)[key],
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
    await prisma.$transaction(async (tx) => {
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
}

export const inventoryService = new InventoryService();
