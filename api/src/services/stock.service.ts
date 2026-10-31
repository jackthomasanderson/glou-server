import { Prisma, type Product } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { prisma, type PrismaClientOrTx } from '../lib/prisma';
import { badRequest, conflict, notFound } from '../lib/errors';
import { groupKey, isGroupableItem, NO_SLOT, unitKind, type UnitKind } from '../lib/finished-item';
import { OWNED_ITEM_FILTER } from '../lib/owned-item';
import { lockFamily, PRODUCT_FIELDS, todayAsPurchaseDate, toUnitView } from '../lib/product-fields';
import { MAX_COPIES, type AddUnitsInput, type CorrectQuantityInput } from '../schemas/stock.schema';
import { LISTED_PRODUCT_FILTER } from './product.service';
import type { FieldChange, ItemView, UnitWriteResult } from '../../../shared/product';
import type { GroupKeyFields } from '../../../shared/units';

/** A unit row as the extended client reads it at the top level (money columns as numbers). */
type UnitRecord = NonNullable<Awaited<ReturnType<typeof prisma.inventoryItem.findFirst>>>;

/** `YYYY-MM-DD` → the midnight-UTC Date Prisma stores in a `@db.Date` column (D6). */
const toDay = (day: string): Date => new Date(`${day}T00:00:00.000Z`);

/**
 * #471 (D5): the group of the family that `target` would join — intact, out
 * of the trash, not written off, same `groupKey` — or null. The single
 * reading of "the same group" for every path that adds copies; the oldest
 * wins should two identical groups ever coexist. Run it inside the
 * transaction that holds the family lock.
 */
export async function findGroupFor(
  tx: PrismaClientOrTx,
  target: GroupKeyFields,
  kind: UnitKind,
): Promise<UnitRecord | null> {
  const key = groupKey(target, kind);
  const candidates = await tx.inventoryItem.findMany({
    where: { productId: target.productId, deletedAt: null, writtenOffAt: null, ...OWNED_ITEM_FILTER },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return candidates.find((unit) => isGroupableItem(unit) && groupKey(unit, kind) === key) ?? null;
}

/**
 * The family as it stands once locked: 404 when unknown, 409 when in the
 * trash — itself, or computed as such because every unit of it is (D10).
 */
async function lockedListedFamily(tx: PrismaClientOrTx, productId: string): Promise<Product> {
  await lockFamily(tx, productId);
  const listed = await tx.product.findFirst({ where: { id: productId, ...LISTED_PRODUCT_FILTER } });
  if (listed) return listed;
  if (await tx.product.findUnique({ where: { id: productId } })) throw conflict('PRODUCT_IN_TRASH');
  throw notFound('PRODUCT_NOT_FOUND');
}

/** The description copied on a new unit's transitional mirror columns (removed by lot Z). */
const mirrorOf = (product: Product) => Object.fromEntries(PRODUCT_FIELDS.map((field) => [field, product[field]]));

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
    return prisma.$transaction(async (tx) => {
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
        purchasedAt: input.purchasedAt === undefined ? todayAsPurchaseDate() : input.purchasedAt && toDay(input.purchasedAt),
        bottleSize: input.bottleSize ?? null,
        cigarsPerBox: input.cigarsPerBox ?? null,
      };
      const group = await findGroupFor(tx, target, kind);
      if (group) {
        const from = group.quantity ?? 1;
        // One group counts at most what one write may (`quantity`'s own bound).
        if (from + input.quantity > MAX_COPIES) throw badRequest('QUANTITY_TOO_LARGE');
        const completed = await tx.inventoryItem.update({
          where: { id: group.id },
          data: { quantity: from + input.quantity, updatedBy: userId },
        });
        return { result: { data: toUnitView(completed), changed: [], removedIds: [] }, merged: true, from, to: from + input.quantity };
      }

      const created = await tx.inventoryItem.create({
        data: {
          ...mirrorOf(product),
          ...target,
          id: uuidv4(),
          userId,
          quantity: input.quantity,
        } as Prisma.InventoryItemUncheckedCreateInput,
      });
      return { result: { data: toUnitView(created), changed: [], removedIds: [] }, merged: false, from: null, to: input.quantity };
    });
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

    return prisma.$transaction(async (tx): Promise<CorrectQuantityOutcome | null> => {
      await lockFamily(tx, head.productId);
      const group = await tx.inventoryItem.findFirst({ where: { id: itemId, deletedAt: null } });
      if (!group) return null;
      const stale = input.expectedUpdatedAt !== undefined
        && new Date(input.expectedUpdatedAt).getTime() !== group.updatedAt.getTime();
      // Moved to another family meanwhile (a merge): its lock was not the one taken.
      if (stale || group.productId !== head.productId) return { conflict: true, item: toUnitView(group) };
      if (!isGroupableItem(group) || !group.isOwned) throw conflict('NOT_A_GROUP');

      const from = group.quantity ?? 1;
      if (input.quantity >= from) throw badRequest('QUANTITY_NOT_LOWER');
      const settled = { needsReview: false, updatedBy: userId };

      if (input.reason === 'input_error') {
        if (input.quantity < 1) throw badRequest('QUANTITY_BELOW_ONE');
        const corrected = await tx.inventoryItem.update({ where: { id: itemId }, data: { quantity: input.quantity, ...settled } });
        return {
          result: { data: toUnitView(corrected), changed: [], removedIds: [] },
          productId: group.productId,
          changes: [{ field: 'quantity', from, to: input.quantity }],
          writtenOffItemId: null,
        };
      }

      const writtenOffAt = new Date();
      if (input.quantity === 0) {
        const marked = await tx.inventoryItem.update({
          where: { id: itemId },
          data: { writtenOffAt, needsReview: false, ...NO_SLOT, updatedBy: userId },
        });
        // A write-off is never put back: its sub-records lose their way back
        // to it, so that putting one back cannot bring it into stock again.
        // In SQL, so that their `updatedAt` (a pending offline edit) stays.
        await tx.$executeRaw`UPDATE "bottles" SET "parentItemId" = NULL WHERE "parentItemId" = ${itemId}`;
        return {
          result: { data: toUnitView(marked), changed: [], removedIds: [] },
          productId: group.productId,
          changes: [{ field: 'writtenOffAt', from: null, to: writtenOffAt }],
          writtenOffItemId: itemId,
        };
      }

      const corrected = await tx.inventoryItem.update({ where: { id: itemId }, data: { quantity: input.quantity, ...settled } });
      const writeOff = await tx.inventoryItem.create({ data: writeOffOf(group, userId, from - input.quantity, writtenOffAt) });
      return {
        result: { data: toUnitView(writeOff), changed: [toUnitView(corrected)], removedIds: [] },
        productId: group.productId,
        changes: [{ field: 'quantity', from, to: input.quantity }],
        writtenOffItemId: writeOff.id,
      };
    });
  },
};

/**
 * The write-off line of `count` copies detached from `group`: everything of
 * the group (family, cellar, prices, purchase day, size, mirror) but no slot,
 * no parent (a write-off is never put back) and nothing left to review.
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
    ...NO_SLOT,
    parentItemId: null,
    needsReview: false,
  };
}
