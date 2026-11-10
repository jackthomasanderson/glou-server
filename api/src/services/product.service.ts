import { Prisma, type Product } from '@prisma/client';
import { prisma, type PrismaClientOrTx } from '../lib/prisma';
import { FINISHED_ITEM_STATE, IN_STOCK_ITEM_FILTER, unitKind } from '../lib/finished-item';
import { namesSameWine } from '../../../shared/units';
import {
  fieldSourcesOf, isProductField, lockFamily, nextLocksAndSources, toUnitView, UNIT_SLOTS, writeProductFields,
  type ProductField, type ProductWrite, type UnitRow,
} from '../lib/product-fields';
import { fitSlotsTo, reviveSlots, slotsFreed, trashSlots } from '../lib/slots';
import { peakWindowSchema } from '../schemas/inventory.schema';
import type { ProductMatchQuery, ProductPatch } from '../schemas/product.schema';
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
export const LISTED_PRODUCT_FILTER = {
  deletedAt: null,
  OR: [{ items: { none: {} } }, { items: { some: { deletedAt: null } } }],
} satisfies Prisma.ProductWhereInput;

const retentionCutoff = () => new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);

type ProductRow = Product & { collections: ProductCollection[] };

const unitViews = (rows: UnitRow[]) => rows.map(toUnitView);

function toProductView(row: ProductRow, items: ItemView[], lastActivityAt: Date | null): ProductView {
  const { fieldSources, collections, ...family } = row;
  const sources = fieldSourcesOf(fieldSources);
  return {
    ...family,
    fieldSources: Object.keys(sources).length > 0 ? sources : null,
    readiness: computeReadiness(row.curveShape, row.peakMaturityFrom, row.peakMaturityTo),
    lastActivityAt,
    collections,
    items,
  };
}

const latest = (a: Date | null | undefined, b: Date | null | undefined): Date | null =>
  !a ? b ?? null : !b ? a : a > b ? a : b;

/**
 * §10.5: when each family was last tasted or had a bottle finished — what a
 * "Plus en cave" card shows. Two grouped queries for the whole page, never
 * one per family. A finished bottle's date is its last write (finishing it).
 */
async function lastActivities(productIds: string[]): Promise<Map<string, Date | null>> {
  if (productIds.length === 0) return new Map();
  const [tastings, finished] = await Promise.all([
    prisma.tastingNote.groupBy({ by: ['productId'], where: { productId: { in: productIds } }, _max: { tastedAt: true } }),
    prisma.inventoryItem.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds }, deletedAt: null, ...FINISHED_ITEM_STATE },
      _max: { updatedAt: true },
    }),
  ]);
  const activity = new Map<string, Date | null>();
  for (const row of tastings) if (row.productId) activity.set(row.productId, row._max.tastedAt);
  for (const row of finished) activity.set(row.productId, latest(activity.get(row.productId), row._max.updatedAt));
  return activity;
}

/** Families and their units as served, the last activity read for all of them at once. */
async function toProductViews<R extends ProductRow & { items: UnitRow[] }>(
  rows: R[],
  pickItems: (row: R) => UnitRow[] = (row) => row.items,
): Promise<ProductView[]> {
  const activity = await lastActivities(rows.map((row) => row.id));
  return rows.map((row) => {
    const { items: _items, ...family } = row;
    return toProductView(family, unitViews(pickItems(row)), activity.get(row.id) ?? null);
  });
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
  /** Write only the fields whose value moves (a bulk action), not every field sent. */
  onlyChanged?: boolean;
  /**
   * FEAT-93: the unit columns written with the family by the same request
   * (its units `ids`): a new category fits their cells to what they will
   * be once written (a box size given with the category), not to what
   * they were.
   */
  unitPatch?: { ids: readonly string[]; columns: Record<string, unknown> };
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
): Promise<{ product: Product; changes: FieldChange[]; unitSlotChanges: UnitSlotChanges[] }> {
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

  const data = (options.onlyChanged
    ? Object.fromEntries(changes.map(({ field, to }) => [field, to]))
    : { ...fields }) as ProductWrite;
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

  if (Object.keys(data).length === 0) return { product: current, changes, unitSlotChanges: [] };
  const product = await writeProductFields(tx, productId, { ...data, updatedBy: options.userId });
  // FEAT-93: another category changes what a unit's cells may be (wine to
  // cigar: a group of single cigars takes one cell) — the cells beyond are
  // freed, the most recently placed first (automatic rule, decision #471
  // point 75: a description edit does not show the plan).
  const unitSlotChanges: UnitSlotChanges[] = [];
  const category = fields.category as Product['category'] | undefined;
  if (category !== undefined && category !== current.category) {
    const units = await tx.inventoryItem.findMany({ where: { productId, deletedAt: null } });
    for (const unit of units) {
      const written = options.unitPatch?.ids.includes(unit.id) ? { ...unit, ...options.unitPatch.columns } as typeof unit : unit;
      const freed = await fitSlotsTo(tx, unit.id, written, unitKind(category));
      if (freed.length > 0) unitSlotChanges.push({ itemId: unit.id, changes: slotsFreed(freed) });
    }
  }
  return { product, changes, unitSlotChanges };
}

/** FEAT-93: the cells a unit gave up through a write of its family, for the unit's history. */
export interface UnitSlotChanges {
  itemId: string;
  changes: FieldChange[];
}

export type UpdateDescriptionResult =
  | { product: ProductView; changes: FieldChange[]; unitSlotChanges: UnitSlotChanges[] }
  | { conflict: true; product: ProductView };

/** A description field to restore: the value as read in the history, and as the description edit takes it. */
export interface DescriptionRestore {
  field: string;
  toValue: unknown;
  patch: Omit<ProductPatch, 'expectedUpdatedAt'>;
}

export type RollbackDescriptionResult =
  | { status: 'invalid_value' }
  | { conflict: true; product: ProductView }
  | { status: 'success'; product: ProductView; changes: FieldChange[]; unitSlotChanges: UnitSlotChanges[] };

export const productService = {
  /**
   * D9: the families with their units in stock, wines known without bottle
   * included. #475: scoped to a cellar, only the families with a bottle in
   * stock there, so a cellar's page is not cut by the household-wide cap.
   */
  async list(options: { cellarId?: string } = {}): Promise<ProductList> {
    const rows = await prisma.product.findMany({
      where: options.cellarId
        ? { deletedAt: null, items: { some: { ...IN_STOCK_ITEM_FILTER, cellarId: options.cellarId } } }
        : LISTED_PRODUCT_FILTER,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      include: {
        collections: COLLECTIONS_INCLUDE,
        items: { where: IN_STOCK_ITEM_FILTER, include: UNIT_SLOTS, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
      take: PRODUCT_LIST_LIMIT + 1,
    });
    return {
      data: await toProductViews(rows.slice(0, PRODUCT_LIST_LIMIT)),
      truncated: rows.length > PRODUCT_LIST_LIMIT,
    };
  },

  /** D9: every unit out of the trash (finished and written off too), the tastings and the history. */
  async get(id: string): Promise<ProductDetail | null> {
    const row = await prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        collections: COLLECTIONS_INCLUDE,
        items: { where: { deletedAt: null }, include: UNIT_SLOTS, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!row) return null;
    const [[view], tastings, history] = await Promise.all([
      toProductViews([row]),
      prisma.tastingNote.findMany({ where: { productId: id }, orderBy: { tastedAt: 'desc' } }),
      readFieldHistory({ productId: id }),
    ]);
    return { ...view, tastings, history };
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
      const { changes, unitSlotChanges } = await writeFamilyDescription(tx, id, patch, {
        userId, isManualEdit: true, autoLock: true, respectLocks: false,
      });
      return { changes, unitSlotChanges };
    });
    if (!outcome) return null;
    const product = await this.view(id);
    if (!product) return null;
    return 'conflict' in outcome ? { conflict: true, product } : { product, changes: outcome.changes, unitSlotChanges: outcome.unitSlotChanges };
  },

  /**
   * FEAT-05 (#471): restores one description field of the family to a value
   * found in its real history — on either side of a recorded change, made to
   * the family or, before #471, through one of its bottles. Any other value
   * is refused, so nothing untracked can be injected this way. The route
   * has already refused a field of the bottles (restored from the bottle's
   * own change) and parsed the value (`patch`). The write is the description edit's
   * ({@link updateDescription}): family locked first, `expectedUpdatedAt`
   * checked under the lock, copy onto the bottles, the field locked as a
   * manual entry (a restore is the member's explicit choice).
   */
  async rollbackField(
    userId: string,
    id: string,
    { field, toValue, patch }: DescriptionRestore,
    expectedUpdatedAt?: string,
  ): Promise<RollbackDescriptionResult | null> {
    const exists = await prisma.product.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!exists) return null;

    const seen = new Set<string>();
    for (const entry of await readFieldHistory({ productId: id })) {
      for (const change of entry.changes ?? []) {
        if (change.field !== field) continue;
        if (change.from !== undefined) seen.add(JSON.stringify(change.from));
        if (change.to !== undefined) seen.add(JSON.stringify(change.to));
      }
    }
    if (toValue === undefined || !seen.has(JSON.stringify(toValue))) return { status: 'invalid_value' };

    const result = await this.updateDescription(userId, id, { ...patch, ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}) });
    if (!result) return null;
    return 'conflict' in result ? result : { status: 'success', ...result };
  },

  /**
   * #471 (FEAT-97 c1, c3): "Vous avez déjà ce vin" — the listed families of
   * the wine typed (`productKey`: same category, producer, name and vintage,
   * the vitola for a cigar; case and edge spaces ignored), wines known
   * without bottle included (FEAT-101); `anyFormat`: every vitola of a cigar
   * asked without one. Narrowed in the database by category and name, the
   * key compared here as everywhere else (shared/units.ts).
   */
  async matching(asked: ProductMatchQuery): Promise<ProductView[]> {
    const candidates = await prisma.product.findMany({
      where: { category: asked.category, ...LISTED_PRODUCT_FILTER, name: { contains: asked.name.trim(), mode: 'insensitive' } },
    });
    const ids = candidates.filter((family) => namesSameWine(asked, family, asked.anyFormat)).map((family) => family.id);
    return this.views(ids);
  },

  /** Several families as the list shows them (their units in stock), in one read; unknown ids are left out. */
  async views(ids: string[]): Promise<ProductView[]> {
    if (ids.length === 0) return [];
    const rows = await prisma.product.findMany({
      where: { id: { in: [...new Set(ids)] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { collections: COLLECTIONS_INCLUDE, items: { where: IN_STOCK_ITEM_FILTER, include: UNIT_SLOTS, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    });
    return toProductViews(rows);
  },

  /** The family as the list shows it (its units in stock), whatever its trash state. */
  async view(id: string): Promise<ProductView | null> {
    const row = await prisma.product.findUnique({
      where: { id },
      include: { collections: COLLECTIONS_INCLUDE, items: { where: IN_STOCK_ITEM_FILTER, include: UNIT_SLOTS, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    });
    if (!row) return null;
    const [view] = await toProductViews([row]);
    return view;
  },

  /**
   * D10: the family and every unit of it not already in the trash get the
   * same `deletedAt`, in one transaction — that timestamp is what a restore
   * brings back. The way to remove a wine known without bottle (FEAT-101 c5).
   */
  async trash(id: string): Promise<{ deletedAt: Date; itemIds: string[] } | null> {
    return prisma.$transaction(async (tx) => {
      await lockFamily(tx, id);
      // D10: a family computed as trashed (every unit in the trash) is not listed — 404 too.
      const current = await tx.product.findFirst({ where: { id, ...LISTED_PRODUCT_FILTER }, select: { id: true } });
      if (!current) return null;
      const deletedAt = new Date();
      const units = await tx.inventoryItem.findMany({ where: { productId: id, deletedAt: null }, select: { id: true } });
      // FEAT-93 (#174): their cells go to the trash with them.
      await trashSlots(tx, units.map((unit) => unit.id), deletedAt);
      await tx.inventoryItem.updateMany({ where: { productId: id, deletedAt: null }, data: { deletedAt } });
      await tx.product.update({ where: { id }, data: { deletedAt } });
      return { deletedAt, itemIds: units.map((unit) => unit.id) };
    });
  },

  /**
   * D10: restores a family still within the retention period, and the units
   * trashed together with it (exactly its `deletedAt`) — a unit trashed on
   * its own before stays in the trash. A copy whose cell was given away
   * meanwhile comes back unplaced (#174, FEAT-93 `reviveSlots`).
   */
  async restore(
    id: string,
    /** FEAT-93: filled with the cells a unit could not take back (see restoreOnce), for its history. */
    slotChanges: UnitSlotChanges[] = [],
  ): Promise<ProductView | null> {
    try {
      return await this.restoreOnce(id, slotChanges);
    } catch (err) {
      // #173: the database's partial unique index is the real guarantee
      // against a cell taken between the check and the write — tried once
      // more, the check then sees it and the copy comes back unplaced.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return this.restoreOnce(id, slotChanges);
      throw err;
    }
  },

  async restoreOnce(id: string, slotChanges: UnitSlotChanges[] = []): Promise<ProductView | null> {
    const freed: UnitSlotChanges[] = [];
    const restored = await prisma.$transaction(async (tx) => {
      await lockFamily(tx, id);
      const current = await tx.product.findFirst({ where: { id, deletedAt: { not: null, gte: retentionCutoff() } } });
      if (!current?.deletedAt) return false;
      const units = await tx.inventoryItem.findMany({
        where: { productId: id, deletedAt: current.deletedAt },
        select: { id: true },
      });
      const ids = units.map((unit) => unit.id);
      await tx.inventoryItem.updateMany({ where: { id: { in: ids } }, data: { deletedAt: null } });
      await reviveSlots(tx, ids);
      // A unit trashed with cells its family's category no longer allows
      // (made single cigars meanwhile) keeps only what it may hold (review of #854).
      for (const unit of await tx.inventoryItem.findMany({ where: { id: { in: ids } } })) {
        const lost = await fitSlotsTo(tx, unit.id, unit, unitKind(current.category));
        if (lost.length > 0) freed.push({ itemId: unit.id, changes: slotsFreed(lost) });
      }
      await tx.product.update({ where: { id }, data: { deletedAt: null } });
      return true;
    });
    slotChanges.push(...freed);
    return restored ? this.view(id) : null;
  },

  /** Families in the trash within the retention period, each with the units trashed together with it. */
  async listTrash(): Promise<TrashedProductView[]> {
    const rows = await prisma.product.findMany({
      where: { deletedAt: { not: null, gte: retentionCutoff() } },
      orderBy: { deletedAt: 'desc' },
      include: {
        collections: COLLECTIONS_INCLUDE,
        items: { where: { deletedAt: { not: null } }, include: UNIT_SLOTS, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
    });
    const trashedTogether = (row: (typeof rows)[number]) =>
      row.items.filter((unit) => unit.deletedAt?.getTime() === row.deletedAt?.getTime());
    const views = await toProductViews(rows, trashedTogether);
    return views.flatMap((view) => (view.deletedAt ? [{ ...view, deletedAt: view.deletedAt }] : []));
  },
};
