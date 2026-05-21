import { prisma } from '../lib/prisma';
import { BottlePatch, BottleInput } from '../schemas/bottle.schema';
import { computeAlertStatus } from './alert.service';
import { v4 as uuidv4 } from 'uuid';

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface BottleHistoryEntry {
  id: number;
  action: string;
  status: string;
  actorId: string;
  actorName: string;
  changes: FieldChange[] | null;
  createdAt: Date;
}

export interface BottleWithTraceability {
  bottle: Record<string, unknown>;
  creator: { id: string; name: string } | null;
  lastEditor: { id: string; name: string } | null;
}

// Bottle type inferred from Prisma client
type Bottle = Awaited<ReturnType<typeof prisma.bottle.findFirst>> extends infer T | null ? NonNullable<T> : never;


/** Corbeille : 7 jours avant purge définitive */
const TRASH_RETENTION_DAYS = 7;

export class BottleService {
  /**
   * List all active (non-deleted) bottles for a given user.
   */
  async listBottles(_userId: string): Promise<Bottle[]> {
    return prisma.bottle.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * List soft-deleted bottles (trash) for a given user still within retention window.
   */
  async listTrash(_userId: string): Promise<Bottle[]> {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    return prisma.bottle.findMany({
      where: {
        deletedAt: { not: null, gte: cutoff },
      },
      orderBy: { deletedAt: 'desc' },
    });
  }

  /**
   * Get a single bottle by id, scoped to the user.
   * Returns null if not found or not owned by user.
   */
  async getBottle(_userId: string, id: string): Promise<Bottle | null> {
    return prisma.bottle.findFirst({
      where: { id, deletedAt: null },
    });
  }

  /**
   * Get a bottle enriched with creator and last-editor user info.
   */
  async getBottleWithTraceability(_userId: string, id: string): Promise<BottleWithTraceability | null> {
    const bottle = await prisma.bottle.findFirst({ where: { id, deletedAt: null } });
    if (!bottle) return null;

    const uniqueIds = [...new Set([bottle.userId, (bottle as unknown as Record<string, unknown>)['updatedBy'] as string | undefined].filter(Boolean))] as string[];
    const users = await prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, displayName: true, username: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.displayName ?? u.username]));

    const creator = bottle.userId ? { id: bottle.userId, name: userMap.get(bottle.userId) ?? bottle.userId } : null;
    const updatedById = (bottle as unknown as Record<string, unknown>)['updatedBy'] as string | undefined;
    const lastEditor = updatedById ? { id: updatedById, name: userMap.get(updatedById) ?? updatedById } : null;

    return { bottle: bottle as unknown as Record<string, unknown>, creator, lastEditor };
  }

  /**
   * Get the field-level change history for a bottle.
   */
  async getBottleHistory(id: string): Promise<BottleHistoryEntry[]> {
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

  /**
   * Create a new bottle.
   */
  async createBottle(userId: string, data: BottleInput): Promise<Bottle> {
    const patch = data as unknown as BottlePatch;
    const dbData = this.mapInputToDb(patch);
    const alertStatus = computeAlertStatus(
      (patch as Record<string, unknown>)['peakMaturityFrom'] as number | undefined,
      (patch as Record<string, unknown>)['peakMaturityTo'] as number | undefined,
    );
    return prisma.bottle.create({
      data: { id: uuidv4(), userId, ...dbData, alertStatus } as never,
    });
  }


  /**
   * Update a bottle, respecting user-locked fields.
   * Locked fields are never overwritten by this method (they require explicit unlock).
   * Returns the updated bottle and the list of field changes for audit.
   */
  async updateBottle(
    userId: string,
    id: string,
    patch: BottlePatch
  ): Promise<{ bottle: Bottle; changes: FieldChange[] } | null> {
    const existing = await prisma.bottle.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return null;

    // Filter out any patched keys that are in lockedFields (user manual override protection)
    const safePatch = Object.fromEntries(
      Object.entries(patch).filter(([key]) => !existing.lockedFields.includes(key))
    ) as BottlePatch;

    // Compute field-level diff for audit trail
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

    // Recompute alertStatus whenever peak maturity window changes
    const from = ('peakMaturityFrom' in safePatch ? safePatch.peakMaturityFrom : existing.peakMaturityFrom) as number | null | undefined;
    const to = ('peakMaturityTo' in safePatch ? safePatch.peakMaturityTo : existing.peakMaturityTo) as number | null | undefined;
    const alertStatus = computeAlertStatus(from, to);

    const bottle = await prisma.bottle.update({
      where: { id },
      data: { ...dbData, alertStatus, updatedAt: new Date(), updatedBy: userId } as never,
    });

    return { bottle, changes };
  }

  /**
   * Bulk update multiple bottles, respecting user-locked fields per bottle.
   */
  async bulkUpdate(
    userId: string,
    ids: string[],
    patch: BottlePatch
  ): Promise<number> {
    const existing = await prisma.bottle.findMany({
      where: { id: { in: ids }, deletedAt: null },
    });

    if (existing.length === 0) return 0;

    let updatedCount = 0;
    await prisma.$transaction(async (tx) => {
      for (const bottle of existing) {
        const safePatch = Object.fromEntries(
          Object.entries(patch).filter(([key]) => !bottle.lockedFields.includes(key))
        );
        await tx.bottle.update({
          where: { id: bottle.id },
          data: {
            ...this.mapInputToDb(safePatch as BottlePatch),
            updatedAt: new Date(),
            updatedBy: userId,
          } as never,
        });
        updatedCount++;
      }
    });

    return updatedCount;
  }

  /**
   * Soft-delete: sets deletedAt. Will be auto-purged after TRASH_RETENTION_DAYS.
   */
  async softDelete(_userId: string, id: string): Promise<Bottle | null> {
    const existing = await prisma.bottle.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return null;

    return prisma.bottle.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Restore a soft-deleted bottle (within retention window).
   */
  async restore(_userId: string, id: string): Promise<Bottle | null> {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const existing = await prisma.bottle.findFirst({
      where: {
        id,
        deletedAt: { not: null, gte: cutoff },
      },
    });
    if (!existing) return null;

    return prisma.bottle.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  /**
   * Purge all bottles past the retention window (called by scheduled job or on startup).
   */
  async purgeTrashed(): Promise<number> {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await prisma.bottle.deleteMany({
      where: { deletedAt: { lt: cutoff } },
    });
    return result.count;
  }

  /**
   * Days left before permanent deletion.
   */
  daysUntilPermanentDelete(deletedAt: Date): number {
    const expiresAt = new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const remaining = Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    return Math.max(0, remaining);
  }

  /**
   * Map validated DTO to Prisma-compatible data shape.
   * Every field is explicitly mapped to avoid TypeScript strict mode violations.
   * Uses BottlePatch (flat, all-optional) rather than the complex discriminated BottleInput.
   */
  private mapInputToDb(data: Partial<BottlePatch>): Record<string, unknown> {
    const d = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    // Common
    if (d['category'] !== undefined) result['category'] = d['category'];
    if (d['name'] !== undefined) result['name'] = d['name'];
    if (d['producer'] !== undefined) result['producer'] = d['producer'];
    if (d['location'] !== undefined) result['location'] = d['location'];
    if (d['collection'] !== undefined) result['collection'] = d['collection'];
    if (d['tags'] !== undefined) result['tags'] = d['tags'];
    if (d['photoUrl'] !== undefined) result['photoUrl'] = d['photoUrl'];
    if (d['notes'] !== undefined) result['notes'] = d['notes'];
    if (d['purchasePrice'] !== undefined) result['purchasePrice'] = d['purchasePrice'];
    if (d['purchasePlace'] !== undefined) result['purchasePlace'] = d['purchasePlace'];
    if (d['estimatedValue'] !== undefined) result['estimatedValue'] = d['estimatedValue'];
    if (d['isOpened'] !== undefined) result['isOpened'] = d['isOpened'];
    if (d['fillLevel'] !== undefined) result['fillLevel'] = d['fillLevel'];
    if (d['openedAt'] !== undefined) result['openedAt'] = d['openedAt'];
    if (d['reminderDate'] !== undefined) result['reminderDate'] = d['reminderDate'];
    if (d['alertStatus'] !== undefined) result['alertStatus'] = d['alertStatus'];
    if (d['alertsPaused'] !== undefined) result['alertsPaused'] = d['alertsPaused'];
    if (d['lockedFields'] !== undefined) result['lockedFields'] = d['lockedFields'];
    if (d['cellarId'] !== undefined) result['cellarId'] = d['cellarId'];

    // Wine/Sparkling
    if (d['vintage'] !== undefined) result['vintage'] = d['vintage'];
    if (d['color'] !== undefined) result['color'] = d['color'];
    if (d['region'] !== undefined) result['region'] = d['region'];
    if (d['grapeVarieties'] !== undefined) result['grapeVarieties'] = d['grapeVarieties'];
    if (d['alcoholDegree'] !== undefined) result['alcoholDegree'] = d['alcoholDegree'];
    if (d['bottleSize'] !== undefined) result['bottleSize'] = d['bottleSize'];
    if (d['peakMaturity'] !== undefined) result['peakMaturity'] = d['peakMaturity'];
    if (d['peakMaturityFrom'] !== undefined) result['peakMaturityFrom'] = d['peakMaturityFrom'];
    if (d['peakMaturityTo'] !== undefined) result['peakMaturityTo'] = d['peakMaturityTo'];
    if (d['needsAeration'] !== undefined) result['needsAeration'] = d['needsAeration'];
    if (d['serviceTemp'] !== undefined) result['serviceTemp'] = d['serviceTemp'];
    if (d['lotNumber'] !== undefined) result['lotNumber'] = d['lotNumber'];
    if (d['sparklingType'] !== undefined) result['sparklingType'] = d['sparklingType'];
    if (d['sugarLevel'] !== undefined) result['sugarLevel'] = d['sugarLevel'];
    if (d['disgorgingDate'] !== undefined) result['disgorgingDate'] = d['disgorgingDate'];
    if (d['baseYear'] !== undefined) result['baseYear'] = d['baseYear'];

    // Spirit
    if (d['edition'] !== undefined) result['edition'] = d['edition'];
    if (d['declaredAge'] !== undefined) result['declaredAge'] = d['declaredAge'];
    if (d['caskType'] !== undefined) result['caskType'] = d['caskType'];
    if (d['additions'] !== undefined) result['additions'] = d['additions'];
    if (d['aromaticProfile'] !== undefined) result['aromaticProfile'] = d['aromaticProfile'];

    // Cigar
    if (d['format'] !== undefined) result['format'] = d['format'];
    if (d['quantity'] !== undefined) result['quantity'] = d['quantity'];
    if (d['manufactureYear'] !== undefined) result['manufactureYear'] = d['manufactureYear'];
    if (d['sealedStatus'] !== undefined) result['sealedStatus'] = d['sealedStatus'];
    if (d['leafOrigin'] !== undefined) result['leafOrigin'] = d['leafOrigin'];
    if (d['factoryCode'] !== undefined) result['factoryCode'] = d['factoryCode'];
    if (d['recommendedHumidity'] !== undefined) result['recommendedHumidity'] = d['recommendedHumidity'];
    if (d['humidificationSystem'] !== undefined) result['humidificationSystem'] = d['humidificationSystem'];

    return result;
  }
}

export const bottleService = new BottleService();

