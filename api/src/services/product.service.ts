import { Prisma, type Product } from '@prisma/client';
import { prisma, type PrismaClientOrTx } from '../lib/prisma';
import { IN_STOCK_ITEM_FILTER } from '../lib/finished-item';
import {
  fieldSourcesOf, isProductField, nextLocksAndSources, toUnitView, writeProductFields,
  type ProductField, type ProductWrite, type UnitRow,
} from '../lib/product-fields';
import { isSlotTaken } from '../lib/slots';
import { peakWindowSchema } from '../schemas/inventory.schema';
import type { ProductPatch } from '../schemas/product.schema';
import { computeAlertStatus, computeReadiness } from './alert.service';
import { readFieldHistory } from './audit.service';
import { TRASH_RETENTION_DAYS, type FieldSource } from '../../../shared/inventory';
import {
  PRODUCT_LIST_LIMIT,
  type FieldChange, type ItemView, type ProductCollection, type ProductDetail, type ProductList,
  type ProductView, type TrashedProductView,
} from '../../../shared/product';

const COLLECTIONS_INCLUDE = { select: { id: true, name: true, color: true, icon: true } } as const;

/**
 * D10: a family is listed unless it is in the trash — itself, or computed as
 * such when it has units and every one of them is in the trash. A family
 * without any unit (a wine known without bottle, FEAT-101) is listed.
 */
const LISTED_PRODUCT_FILTER = {
  deletedAt: null,
  OR: [{ items: { none: {} } }, { items: { some: { deletedAt: null } } }],
} satisfies Prisma.ProductWhereInput;

const retentionCutoff = () => new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);

type ProductRow = Product & { collections: ProductCollection[] };

function toProductView(row: ProductRow, items: ItemView[]): ProductView {
  const { fieldSources, collections, ...family } = row;
  const sources = fieldSourcesOf(fieldSources);
  return {
    ...family,
    fieldSources: Object.keys(sources).length > 0 ? sources : null,
    readiness: computeReadiness(row.curveShape, row.peakMaturityFrom, row.peakMaturityTo),
    collections,
    items,
  };
}

const unitViews = (rows: UnitRow[]) => rows.map(toUnitView);

/**
 * #471 (F2 review): serialises every write of a family's fields. Two members
 * changing the region and the colour through two sibling bottles, or each one
 * end of the drinking window, used to read the family outside the
 * transaction and recompute its locks, sources, window and alert from that
 * stale copy: one lock was lost, or the window ended up reversed.
 */
async function lockFamily(tx: PrismaClientOrTx, productId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "products" WHERE "id" = ${productId} FOR UPDATE`;
}

export interface FamilyWriteOptions {
  userId: string;
  /** Fields the caller touched (FEAT-05 auto-lock and source reset); defaults to the patch's own. */
  touched?: string[];
  fieldSources?: Partial<Record<string, FieldSource>>;
  isManualEdit: boolean;
  autoLock: boolean;
  /** An automated update (OCR) leaves the family's locked fields alone. */
  respectLocks: boolean;
}

/**
 * #471: writes description fields of a family inside the caller's
 * transaction, from the family as it is once locked (see {@link lockFamily}):
 * FEAT-05 locks and sources, the drinking window checked against its stored
 * other end (#706, throws a ZodError → 400), the derived `alertStatus`. The
 * family is written only when something of it changes; `changes` lists the
 * fields whose value moves.
 */
export async function writeFamilyDescription(
  tx: PrismaClientOrTx,
  productId: string,
  patch: Partial<Record<ProductField, unknown>>,
  options: FamilyWriteOptions,
): Promise<{ product: Product; changes: FieldChange[] }> {
  await lockFamily(tx, productId);
  const current = await tx.product.findUniqueOrThrow({ where: { id: productId } });
  const fields = Object.fromEntries(
    Object.entries(patch).filter(([field, value]) =>
      value !== undefined && isProductField(field) && field !== 'alertStatus'
      && !(options.respectLocks && current.lockedFields.includes(field))),
  ) as Partial<Record<ProductField, unknown>>;

  const stored = current as unknown as Record<string, unknown>;
  const changes = Object.entries(fields)
    .filter(([field, value]) => JSON.stringify(stored[field]) !== JSON.stringify(value))
    .map(([field, value]) => ({ field, from: stored[field], to: value }));

  const data = { ...fields } as ProductWrite;
  Object.assign(data, nextLocksAndSources(current, isProductField, {
    touched: options.touched ?? Object.keys(patch),
    fieldSources: options.fieldSources,
    isManualEdit: options.isManualEdit,
    autoLock: options.autoLock,
  }));

  const from = ('peakMaturityFrom' in fields ? fields.peakMaturityFrom : current.peakMaturityFrom) as number | null | undefined;
  const to = ('peakMaturityTo' in fields ? fields.peakMaturityTo : current.peakMaturityTo) as number | null | undefined;
  if ('peakMaturityFrom' in fields || 'peakMaturityTo' in fields) {
    peakWindowSchema.parse({ peakMaturityFrom: from, peakMaturityTo: to });
  }
  const alertStatus = computeAlertStatus(from, to);
  if (alertStatus !== current.alertStatus) data.alertStatus = alertStatus;

  if (Object.keys(data).length === 0) return { product: current, changes };
  const product = await writeProductFields(tx, productId, { ...data, updatedBy: options.userId });
  return { product, changes };
}

export type UpdateDescriptionResult =
  | { product: ProductView; changes: FieldChange[] }
  | { conflict: true; product: ProductView };

export const productService = {
  /** D9: the families with their units in stock, wines known without bottle included. */
  async list(): Promise<ProductList> {
    const rows = await prisma.product.findMany({
      where: LISTED_PRODUCT_FILTER,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      include: {
        collections: COLLECTIONS_INCLUDE,
        items: { where: IN_STOCK_ITEM_FILTER, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
      take: PRODUCT_LIST_LIMIT + 1,
    });
    return {
      data: rows.slice(0, PRODUCT_LIST_LIMIT).map(({ items, ...row }) => toProductView(row, unitViews(items))),
      truncated: rows.length > PRODUCT_LIST_LIMIT,
    };
  },

  /** D9: every unit out of the trash (finished and written off too), the tastings and the history. */
  async get(id: string): Promise<ProductDetail | null> {
    const row = await prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        collections: COLLECTIONS_INCLUDE,
        items: { where: { deletedAt: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!row) return null;
    const { items, ...family } = row;
    const [tastings, history] = await Promise.all([
      prisma.tastingNote.findMany({ where: { productId: id }, orderBy: { tastedAt: 'desc' } }),
      readFieldHistory({ productId: id }),
    ]);
    return { ...toProductView(family, unitViews(items)), tastings, history };
  },

  /**
   * FEAT-92 c4: corrects the family's description once, for all its
   * bottles. `expectedUpdatedAt` is checked against the family once locked,
   * so a stale form or a replayed offline change gets a conflict instead of
   * overwriting someone else's edit. The units' `updatedAt` stays untouched
   * (D22).
   */
  async updateDescription(userId: string, id: string, rawPatch: ProductPatch): Promise<UpdateDescriptionResult | null> {
    const { expectedUpdatedAt, ...patch } = rawPatch;
    const outcome = await prisma.$transaction(async (tx) => {
      await lockFamily(tx, id);
      const current = await tx.product.findFirst({ where: { id, deletedAt: null } });
      if (!current) return null;
      if (expectedUpdatedAt !== undefined && new Date(expectedUpdatedAt).getTime() !== current.updatedAt.getTime()) {
        return { conflict: true as const };
      }
      const { changes } = await writeFamilyDescription(tx, id, patch, {
        userId, isManualEdit: true, autoLock: true, respectLocks: false,
      });
      return { changes };
    });
    if (!outcome) return null;
    const product = await this.view(id);
    if (!product) return null;
    return 'conflict' in outcome ? { conflict: true, product } : { product, changes: outcome.changes };
  },

  /** The family as the list shows it (its units in stock), whatever its trash state. */
  async view(id: string): Promise<ProductView | null> {
    const row = await prisma.product.findUnique({
      where: { id },
      include: { collections: COLLECTIONS_INCLUDE, items: { where: IN_STOCK_ITEM_FILTER, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    });
    if (!row) return null;
    const { items, ...family } = row;
    return toProductView(family, unitViews(items));
  },

  /**
   * D10: the family and every unit of it not already in the trash get the
   * same `deletedAt`, in one transaction — that timestamp is what a restore
   * brings back. The way to remove a wine known without bottle (FEAT-101 c5).
   */
  async trash(id: string): Promise<{ deletedAt: Date; itemIds: string[] } | null> {
    return prisma.$transaction(async (tx) => {
      await lockFamily(tx, id);
      const current = await tx.product.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
      if (!current) return null;
      const deletedAt = new Date();
      const units = await tx.inventoryItem.findMany({ where: { productId: id, deletedAt: null }, select: { id: true } });
      await tx.inventoryItem.updateMany({ where: { productId: id, deletedAt: null }, data: { deletedAt } });
      await tx.product.update({ where: { id }, data: { deletedAt } });
      return { deletedAt, itemIds: units.map((unit) => unit.id) };
    });
  },

  /**
   * D10: restores a family still within the retention period, and the units
   * trashed together with it (exactly its `deletedAt`) — a unit trashed on
   * its own before stays in the trash. A unit whose grid slot was given away
   * meanwhile comes back unplaced (#174).
   */
  async restore(id: string): Promise<ProductView | null> {
    try {
      return await this.restoreOnce(id, false);
    } catch (err) {
      // #173: the database's partial unique index is the real guarantee
      // against a slot taken between the check and the write — come back
      // unplaced rather than fail.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return this.restoreOnce(id, true);
      throw err;
    }
  },

  async restoreOnce(id: string, unplaceAll: boolean): Promise<ProductView | null> {
    const restored = await prisma.$transaction(async (tx) => {
      await lockFamily(tx, id);
      const current = await tx.product.findFirst({ where: { id, deletedAt: { not: null, gte: retentionCutoff() } } });
      if (!current?.deletedAt) return false;
      const units = await tx.inventoryItem.findMany({
        where: { productId: id, deletedAt: current.deletedAt },
        select: { id: true, cellarId: true, slotColumn: true, slotRow: true },
      });
      for (const unit of units) {
        const unplace = unit.slotColumn != null && (unplaceAll || await isSlotTaken(tx, unit));
        await tx.inventoryItem.update({
          where: { id: unit.id },
          data: unplace ? { deletedAt: null, slotColumn: null, slotRow: null } : { deletedAt: null },
        });
      }
      await tx.product.update({ where: { id }, data: { deletedAt: null } });
      return true;
    });
    return restored ? this.view(id) : null;
  },

  /** Families in the trash within the retention period, each with the units trashed together with it. */
  async listTrash(): Promise<TrashedProductView[]> {
    const rows = await prisma.product.findMany({
      where: { deletedAt: { not: null, gte: retentionCutoff() } },
      orderBy: { deletedAt: 'desc' },
      include: {
        collections: COLLECTIONS_INCLUDE,
        items: { where: { deletedAt: { not: null } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
    });
    return rows.flatMap(({ items, ...family }) => {
      const { deletedAt } = family;
      if (!deletedAt) return [];
      const trashedTogether = items.filter((unit) => unit.deletedAt?.getTime() === deletedAt.getTime());
      return [{ ...toProductView(family, unitViews(trashedTogether)), deletedAt }];
    });
  },
};
