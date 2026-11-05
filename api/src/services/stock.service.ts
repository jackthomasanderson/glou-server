import { Prisma, type Product } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { prisma, type PrismaClientOrTx } from '../lib/prisma';
import { badRequest, conflict, notFound } from '../lib/errors';
import { groupKey, isGroupableItem, slotCapacity, unitKind, type UnitKind } from '../lib/finished-item';
import { lockFamily, purchaseDayFromInput, toUnitView, unitViewOf, UNIT_SLOTS } from '../lib/product-fields';
import { fitSlots, freeSlots, slotsFreed } from '../lib/slots';
import { MAX_COPIES, type AddUnitsInput, type CorrectQuantityInput } from '../schemas/stock.schema';
import { LISTED_PRODUCT_FILTER } from './product.service';
import type { FieldChange, ItemView, UnitWriteResult } from '../../../shared/product';
import type { GroupKeyFields } from '../../../shared/units';
import { placesAgree, placesEqual } from '../../../shared/review';

/** A unit row as the extended client reads it at the top level (money columns as numbers). */
type UnitRecord = NonNullable<Awaited<ReturnType<typeof prisma.inventoryItem.findFirst>>>;

/** What narrows {@link findGroupFor} beyond the group identity. */
export interface GroupSearch {
  /** The unit the copies come from, never its own target. */
  excludeId?: string;
  /**
   * Units an import has just written or completed: another of its lines joins them only with strictly the
   * same places (their lines differ by definition, and lines of other places stay apart), while a group
   * already in the cellar is joined by the looser {@link placesAgree}.
   */
  strictPlacesFor?: ReadonlySet<string>;
  /** Only a group of this estimated value, strictly (empty = empty only): a move must not change the value. */
  estimatedValue?: number | null;
  /** Never a group whose number is still to review (needsReview), as the review merge (planGroupFusion). */
  settledOnly?: boolean;
  /**
   * Only a group whose place of purchase and location agree with these
   * (design.md rule 4, {@link placesAgree}): joining must never drop one.
   */
  placesOf?: { purchasePlace: string | null; location: string | null };
}

/**
 * #471 (D5): the group of the family that `target` would join — intact, out
 * of the trash, not written off, same `groupKey` — or null. The single
 * reading of "the same group" for every path that adds copies; the oldest
 * wins should two identical groups ever coexist. Copies without a purchase
 * day never complete a group: the budget then dates each line by its
 * creation, and joining a line created another day would move their
 * spending to another period (same rule as planGroupFusion). Run it inside
 * the transaction that holds the family lock.
 */
export async function findGroupFor(
  tx: PrismaClientOrTx,
  target: GroupKeyFields,
  kind: UnitKind,
  search: GroupSearch = {},
): Promise<UnitRecord | null> {
  if (target.purchasedAt == null) return null;
  const key = groupKey(target, kind);
  const candidates = await tx.inventoryItem.findMany({
    where: {
      productId: target.productId, deletedAt: null, writtenOffAt: null,
      ...(search.excludeId !== undefined ? { id: { not: search.excludeId } } : {}),
      ...(search.settledOnly ? { needsReview: false } : {}),
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return candidates.find((unit) => isGroupableItem(unit) && groupKey(unit, kind) === key
    && (search.estimatedValue === undefined || (unit.estimatedValue ?? null) === search.estimatedValue)
    && (search.placesOf === undefined
      || (search.strictPlacesFor?.has(unit.id) ? placesEqual(unit, search.placesOf) : placesAgree(unit, search.placesOf)))) ?? null;
}

/**
 * D15: the inventory entries that counted `itemIds` keep the number they
 * found (an empty `foundQuantity` reads "the whole unit") before those
 * groups grow — the copies added were not there when they were counted.
 * In SQL, as the transformation and the review merge do.
 */
export async function keepFoundQuantities(tx: PrismaClientOrTx, itemIds: string[]): Promise<void> {
  await tx.$executeRaw`UPDATE "inventory_count_entries" AS e SET "foundQuantity" = coalesce(e."foundQuantity", b."quantity")
    FROM "bottles" AS b WHERE b."id" = e."itemId" AND e."itemId" IN (${Prisma.join(itemIds)})`;
}

/**
 * The family as it stands once locked: 404 when unknown, 409 when in the
 * trash — itself, or computed as such because every unit of it is (D10).
 */
export async function lockedListedFamily(tx: PrismaClientOrTx, productId: string): Promise<Product> {
  await lockFamily(tx, productId);
  const listed = await tx.product.findFirst({ where: { id: productId, ...LISTED_PRODUCT_FILTER } });
  if (listed) return listed;
  if (await tx.product.findUnique({ where: { id: productId } })) throw conflict('PRODUCT_IN_TRASH');
  throw notFound('PRODUCT_NOT_FOUND');
}

/** Where new copies go (D5): everything of a group's identity. */
export type CopiesTarget = GroupKeyFields & { purchasedAt: Date | null };

/** The state of a sub-record written opened (the CSV import of an exported opened bottle or box). */
export interface OpenedState {
  isOpened: true;
  fillLevel: number | null;
  cigarsLeft: number | null;
  openedAt: Date | null;
}

/** What the CSV import adds to {@link addCopies}: a sub-record's state, and the unit columns beyond a group's identity. */
export interface CopiesOptions {
  opened?: OpenedState;
  /** Where it was bought and kept, its estimated value, and whether its number is still to be reviewed. */
  extra?: { purchasePlace: string | null; location: string | null; estimatedValue: number | null; needsReview: boolean };
  /** See {@link GroupSearch.strictPlacesFor}. */
  strictPlacesFor?: ReadonlySet<string>;
}

/**
 * #471 (D5): adds `count` copies to `product` — completing its group of the
 * same `target` identity (×6 → ×8), else as a new line of the family. The
 * single write behind "Ajouter des bouteilles" and the CSV import. Run it in
 * the transaction that holds the family's lock (lock order: families first).
 * `fieldSources` tags a new line's own fields; a completed group keeps its.
 */
export async function addCopies(
  tx: PrismaClientOrTx,
  userId: string,
  product: Product,
  target: CopiesTarget,
  count: number,
  fieldSources?: Record<string, string>,
  options: CopiesOptions = {},
): Promise<{ unit: UnitRecord; from: number | null; to: number }> {
  const { opened, extra } = options;
  // An opened bottle or box is a sub-record, and a group still to review stays as it was
  // written: one unit of its own, never a group to complete.
  const standalone = opened !== undefined || extra?.needsReview === true;
  // Design.md rule 4: a group is completed only by copies of the same estimated value whose
  // places of purchase and location agree, and never one still to review.
  const group = standalone ? null : await findGroupFor(
    tx, target, unitKind(product.category),
    extra ? { settledOnly: true, estimatedValue: extra.estimatedValue, placesOf: extra, strictPlacesFor: options.strictPlacesFor } : {},
  );
  if (group) {
    const from = group.quantity ?? 1;
    // One group counts at most what one write may (`quantity`'s own bound).
    if (from + count > MAX_COPIES) throw badRequest('QUANTITY_TOO_LARGE');
    await keepFoundQuantities(tx, [group.id]);
    // Nothing of the copies is lost: a place of purchase or location the group lacks is filled in by theirs.
    const lacks = (value: string | null) => value === null || value.trim() === '';
    const unit = await tx.inventoryItem.update({
      where: { id: group.id },
      data: {
        quantity: from + count,
        updatedBy: userId,
        ...(extra?.purchasePlace && lacks(group.purchasePlace) ? { purchasePlace: extra.purchasePlace } : {}),
        ...(extra?.location && lacks(group.location) ? { location: extra.location } : {}),
      },
    });
    return { unit, from, to: from + count };
  }
  const unit = await tx.inventoryItem.create({
    data: {
      ...target,
      id: uuidv4(),
      userId,
      quantity: count,
      ...(opened ?? {}),
      ...(extra ?? {}),
      ...(fieldSources && Object.keys(fieldSources).length > 0 ? { fieldSources } : {}),
    } as Prisma.InventoryItemUncheckedCreateInput,
  });
  return { unit, from: null, to: count };
}

export interface AddUnitsOutcome {
  result: UnitWriteResult;
  /** An existing group was completed (×6 → ×8) rather than a line created. */
  merged: boolean;
  /** The group's number before (null for a new line) and after. */
  from: number | null;
  to: number;
}

export type CorrectQuantityOutcome =
  | { conflict: true; item: ItemView }
  | {
      result: UnitWriteResult;
      productId: string;
      /** What the history records on the group. */
      changes: FieldChange[];
      /** The write-off line, when the reason was "broken / given away / lost". */
      writtenOffItemId: string | null;
    };

export const stockService = {
  /**
   * FEAT-92 c1-c2, FEAT-95 c1-c2, FEAT-101 c3: adds copies to a known family
   * without retyping its description. They complete the group of the same
   * cellar, price, size and purchase day (D5, point 58), else form a new
   * line of the family — a wine known without bottle comes back in stock
   * that way. A family in the trash is refused: restore it first.
   */
  async addUnits(userId: string, productId: string, input: AddUnitsInput): Promise<AddUnitsOutcome> {
    return prisma.$transaction((tx) => addUnitsIn(tx, userId, productId, input));
  },

  /**
   * FEAT-92 c3, FEAT-95 c4, point 34: "Corriger le nombre" of a group.
   * - `input_error`: the copies never existed — `quantity` goes down (out of
   *   the stock, the value and the spending), never below 1 (the trash is
   *   for a whole group).
   * - `written_off` (broken / given away / lost): k copies leave the stock
   *   but stay in the spending — detached as a write-off line of k copies
   *   (no slot, never put back), or the whole group marked when all go.
   * Either way the guessed split of the transformation is settled
   * (`needsReview`, point 55). `expectedUpdatedAt` is checked against the
   * group once its family is locked. Null when the unit is unknown or in
   * the trash.
   */
  async correctQuantity(userId: string, itemId: string, input: CorrectQuantityInput): Promise<CorrectQuantityOutcome | null> {
    const head = await prisma.inventoryItem.findFirst({ where: { id: itemId, deletedAt: null }, select: { productId: true } });
    if (!head) return null;

    return prisma.$transaction((tx) => correctQuantityIn(tx, userId, itemId, head.productId, input));
  },
};

/**
 * The body of `addUnits`, inside a transaction of the caller's: the family is
 * locked here (a no-op when the caller already holds its lock, as the
 * rotating inventory does for every family it writes, in sorted order).
 */
export async function addUnitsIn(
  tx: PrismaClientOrTx,
  userId: string,
  productId: string,
  input: AddUnitsInput,
): Promise<AddUnitsOutcome> {
  const product = await lockedListedFamily(tx, productId);
  const kind = unitKind(product.category);
  if (kind !== 'cigar' && input.cigarsPerBox != null) throw badRequest('CIGARS_PER_BOX_FOR_CIGARS_ONLY');
  const cellarId = input.cellarId ?? null;
  if (cellarId && !(await tx.cellar.findUnique({ where: { id: cellarId }, select: { id: true } }))) {
    throw badRequest('CELLAR_NOT_FOUND');
  }

  const target = {
    productId,
    cellarId,
    purchasePrice: input.purchasePrice ?? null,
    purchasedAt: purchaseDayFromInput(input.purchasedAt),
    bottleSize: input.bottleSize ?? null,
    cigarsPerBox: input.cigarsPerBox ?? null,
  };
  const added = await addCopies(tx, userId, product, target, input.quantity);
  return { result: { data: await unitViewOf(tx, added.unit), changed: [], removedIds: [] }, merged: added.from !== null, from: added.from, to: added.to };
}

/**
 * The body of `correctQuantity`, inside a transaction of the caller's.
 * `productId` is the family read before the transaction: it is the one
 * locked, and a group that moved to another family meanwhile is a conflict.
 */
export async function correctQuantityIn(
  tx: PrismaClientOrTx,
  userId: string,
  itemId: string,
  productId: string,
  input: CorrectQuantityInput,
): Promise<CorrectQuantityOutcome | null> {
  await lockFamily(tx, productId);
  const group = await tx.inventoryItem.findFirst({ where: { id: itemId, deletedAt: null } });
  if (!group) return null;
  const stale = input.expectedUpdatedAt !== undefined
    && new Date(input.expectedUpdatedAt).getTime() !== group.updatedAt.getTime();
  // Moved to another family meanwhile (a merge): its lock was not the one taken.
  if (stale || group.productId !== productId) return { conflict: true, item: await unitViewOf(tx, group) };
  const { category } = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { category: true } });
  // FEAT-93: the copies that leave free their cells — unplaced ones first,
  // then the most recently placed (automatic rule until lot S2's choice).
  const fitTo = async (quantity: number) =>
    slotsFreed(await fitSlots(tx, itemId, slotCapacity({ ...group, quantity }, unitKind(category))));
  if (!isGroupableItem(group)) throw conflict('NOT_A_GROUP');

  const from = group.quantity ?? 1;
  if (input.quantity >= from) throw badRequest('QUANTITY_NOT_LOWER');
  const settled = { needsReview: false, updatedBy: userId };

  if (input.reason === 'input_error') {
    if (input.quantity < 1) throw badRequest('QUANTITY_BELOW_ONE');
    const freed = await fitTo(input.quantity);
    const corrected = await tx.inventoryItem.update({ where: { id: itemId }, data: { quantity: input.quantity, ...settled }, include: UNIT_SLOTS });
    return {
      result: { data: toUnitView(corrected), changed: [], removedIds: [] },
      productId: group.productId,
      changes: [{ field: 'quantity', from, to: input.quantity }, ...freed],
      writtenOffItemId: null,
    };
  }

  const writtenOffAt = new Date();
  if (input.quantity === 0) {
    const freed = slotsFreed(await freeSlots(tx, itemId));
    const marked = await tx.inventoryItem.update({
      where: { id: itemId },
      data: { writtenOffAt, needsReview: false, updatedBy: userId },
      include: UNIT_SLOTS,
    });
    // A write-off is never put back: its sub-records lose their way back
    // to it, so that putting one back cannot bring it into stock again.
    // In SQL, so that their `updatedAt` (a pending offline edit) stays.
    await tx.$executeRaw`UPDATE "bottles" SET "parentItemId" = NULL WHERE "parentItemId" = ${itemId}`;
    return {
      result: { data: toUnitView(marked), changed: [], removedIds: [] },
      productId: group.productId,
      changes: [{ field: 'writtenOffAt', from: null, to: writtenOffAt }, ...freed],
      writtenOffItemId: itemId,
    };
  }

  const freed = await fitTo(input.quantity);
  const corrected = await tx.inventoryItem.update({ where: { id: itemId }, data: { quantity: input.quantity, ...settled }, include: UNIT_SLOTS });
  const writeOff = await tx.inventoryItem.create({ data: writeOffOf(group, userId, from - input.quantity, writtenOffAt), include: UNIT_SLOTS });
  return {
    result: { data: toUnitView(writeOff), changed: [toUnitView(corrected)], removedIds: [] },
    productId: group.productId,
    changes: [{ field: 'quantity', from, to: input.quantity }, ...freed],
    writtenOffItemId: writeOff.id,
  };
}

/**
 * The write-off line of `count` copies detached from `group`: everything of
 * the group (family, cellar, prices, purchase day, size) but no cell of
 * the plan (out of stock), no parent (a write-off is never put back) and nothing left to review.
 */
function writeOffOf(group: UnitRecord, userId: string, count: number, writtenOffAt: Date): Prisma.InventoryItemUncheckedCreateInput {
  const {
    id: _id, createdAt: _createdAt, updatedAt: _updatedAt, updatedBy: _updatedBy, userId: _creator,
    deletedAt: _deletedAt, fieldSources, ...copied
  } = group;
  return {
    ...copied,
    fieldSources: fieldSources === null ? Prisma.DbNull : (fieldSources as Prisma.InputJsonValue),
    id: uuidv4(),
    userId,
    quantity: count,
    writtenOffAt,
    parentItemId: null,
    needsReview: false,
  };
}
