import { Prisma, type Product } from '@prisma/client';
import { prisma, type PrismaClientOrTx } from '../lib/prisma';
import { badRequest, conflict, notFound } from '../lib/errors';
import { isIntactItem, productKey, summarizeStock, unitKind } from '../lib/finished-item';
import { OWNED_ITEM_FILTER } from '../lib/owned-item';
import { compareFamilyIds, fieldSourcesOf, lockFamilies, lockFamily, toUnitView, writeProductFields, type ProductWrite } from '../lib/product-fields';
import { peakWindowSchema } from '../schemas/inventory.schema';
import { computeAlertStatus } from './alert.service';
import { LISTED_PRODUCT_FILTER, productService } from './product.service';
import type { FieldChange, ItemView } from '../../../shared/product';
import {
  comparableValue, findDisagreements, formMergeCases, planGroupFusion, preselectedFamily, REVIEW_FIELDS,
  DESCRIPTION_LIMITS, type MergeOverLimits, type MergeRequest, type ReviewFamily, type ReviewList,
} from '../../../shared/review';

/** Oldest first (creation date, then id): the walk order of D2, whose first family survives. */
const byAge = (a: Product, b: Product) => a.createdAt.getTime() - b.createdAt.getTime() || compareFamilyIds(a.id, b.id);

/** A pair of families, ordered as `product_distinctions` stores it (its CHECK compares in "C" collation). */
const orderedPair = (a: string, b: string): [string, string] => (compareFamilyIds(a, b) < 0 ? [a, b] : [b, a]);

/** `YYYY-MM-DD` of a family's creation, in the API's time zone (`TZ`), as the migration dates the notes. */
function dayOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The first entry of each key, in the order given (a later duplicate never replaces it). */
function firstOf<K, V>(entries: ReadonlyArray<readonly [K, V]>): Array<[K, V]> {
  const first = new Map<K, V>();
  for (const [key, value] of entries) if (!first.has(key)) first.set(key, value);
  return [...first.entries()];
}

const hasText = (value: string | null): value is string => value !== null && value.trim() !== '';

/**
 * The families of one merge, locked in the one order (lock rule, #787
 * review), as they stand: 404 when one is unknown, 409 when one is in the
 * trash (itself, or computed as such, D10).
 */
async function lockedFamilies(tx: PrismaClientOrTx, ids: string[]): Promise<Product[]> {
  await lockFamilies(tx, ids);
  const listed = await tx.product.findMany({ where: { id: { in: ids }, ...LISTED_PRODUCT_FILTER } });
  if (listed.length === ids.length) return listed;
  const known = await tx.product.count({ where: { id: { in: ids } } });
  if (known < ids.length) throw notFound('PRODUCT_NOT_FOUND');
  throw conflict('PRODUCT_IN_TRASH');
}

/** Same wine (`productKey`), and no pair of them declared different ("C'est un autre vin"). */
async function assertSameWine(tx: PrismaClientOrTx, families: Product[]): Promise<void> {
  if (new Set(families.map(productKey)).size > 1) throw badRequest('NOT_SAME_WINE');
  const ids = families.map((family) => family.id);
  const apart = await tx.productDistinction.count({ where: { productId: { in: ids }, otherProductId: { in: ids } } });
  if (apart > 0) throw conflict('DISTINCT_WINES');
}

/**
 * The description of the merged family. Per compared field: the member's
 * choice, else the pre-selected value where the families disagree (point
 * 40), else the first value given in walk order (they all agree). The other
 * family fields follow D3, as the transformation merges them.
 */
function mergedFamily(walk: Product[], choices: MergeRequest['choices'] = {}): ProductWrite {
  const byId = new Map(walk.map((family) => [family.id, family]));
  const reviewed = walk as unknown as ReviewFamily[];
  const disagreeing = new Set(findDisagreements(reviewed).map((d) => d.field));
  const keptFrom = new Map<string, Product>();

  const data: Record<string, unknown> = {};
  for (const field of REVIEW_FIELDS) {
    const chosenId = choices[field];
    let source: Product | undefined;
    if (chosenId !== undefined) {
      source = byId.get(chosenId);
      if (!source || comparableValue(field, source[field]) === null) throw badRequest('INVALID_CHOICE', { field });
    } else if (disagreeing.has(field)) {
      source = byId.get(preselectedFamily(field, reviewed) as string);
    } else {
      source = walk.find((family) => comparableValue(field, family[field]) !== null);
    }
    data[field] = source ? source[field] : (field === 'grapeVarieties' ? [] : null);
    if (source) keptFrom.set(field, source);
  }
  peakWindowSchema.parse({ peakMaturityFrom: data.peakMaturityFrom, peakMaturityTo: data.peakMaturityTo });

  const newest = [...walk].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || byAge(a, b));
  const photo = newest.find((family) => hasText(family.photoUrl))?.photoUrl ?? null;
  const photos = newest.flatMap((family) => [family.photoUrl, ...family.otherPhotoUrls]).filter(hasText);
  // Identical notes are kept once, dated by the oldest family holding them;
  // identical labels (case and spaces aside) keep their first spelling.
  const notes = firstOf(walk.filter((f) => hasText(f.notes)).map((f) => [f.notes!.trim(), f] as const));
  const labels = firstOf(walk.filter((f) => hasText(f.collection)).map((f) => [f.collection!.trim().toLowerCase(), f.collection!.trim()] as const))
    .map(([, label]) => label);
  // The legacy label holds what fits in the form's limit (the first always
  // stays); when some do not fit, every label goes to the notes, dated today,
  // so none is lost — as the transformation does.
  const kept = labels.reduce((n, _label, i) => (i === 0 || labels.slice(0, i + 1).join(' / ').length <= DESCRIPTION_LIMITS.collection ? i + 1 : n), 0);
  const noteParts = notes.length === 1 ? [notes[0][0]]
    : notes.map(([text, family]) => `${dayOf(family.createdAt)}\n${text}`);
  if (labels.length > kept) noteParts.push(`${dayOf(new Date())}\nLibellés d'origine : ${labels.join(' / ')}`);
  const dates = (pick: (family: Product) => Date | null) => walk.map(pick).filter((d): d is Date => d !== null);
  const earliest = (values: Date[]) => (values.length > 0 ? new Date(Math.min(...values.map((d) => d.getTime()))) : null);

  // Field sources (FEAT-05): per field, the source of the family whose value was kept.
  const sources: Record<string, string> = {};
  for (const family of walk) {
    for (const [field, source] of Object.entries(fieldSourcesOf(family.fieldSources))) {
      const owner = keptFrom.get(field);
      if (owner ? owner.id === family.id : !(field in sources)) sources[field] = source;
    }
  }

  return {
    ...data,
    collection: kept > 0 ? labels.slice(0, kept).join(' / ') : null,
    tags: [...new Set(walk.flatMap((family) => family.tags))],
    photoUrl: photo,
    otherPhotoUrls: [...new Set(photos)].filter((url) => url !== photo),
    // A single note is kept as it was; several are each preceded by the day
    // their family was created, oldest first (D3).
    notes: noteParts.length > 0 ? noteParts.join('\n\n') : null,
    alertsPaused: walk.every((family) => family.alertsPaused),
    consumptionPostponedUntil: walk.some((family) => family.consumptionPostponedUntil === null)
      ? null : earliest(dates((family) => family.consumptionPostponedUntil)),
    reminderDate: earliest(dates((family) => family.reminderDate)),
    curveShape: newest.find((family) => family.curveShape !== null)?.curveShape ?? null,
    alertStatus: computeAlertStatus(data.peakMaturityFrom as number | null, data.peakMaturityTo as number | null),
    lockedFields: [...new Set(walk.flatMap((family) => family.lockedFields))],
    fieldSources: Object.keys(sources).length > 0 ? sources : Prisma.DbNull,
  } as ProductWrite;
}

/** What the history of the surviving family records of a merge (FEAT-05). */
const MERGE_HISTORY_FIELDS: readonly string[] = [
  ...REVIEW_FIELDS, 'collection', 'tags', 'photoUrl', 'notes', 'alertsPaused', 'consumptionPostponedUntil', 'reminderDate', 'curveShape',
];

/** The fields whose value moves on the surviving family. */
function changesOn(survivor: Product, data: ProductWrite): FieldChange[] {
  const before = survivor as unknown as Record<string, unknown>;
  const after = data as Record<string, unknown>;
  return MERGE_HISTORY_FIELDS
    .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map((field) => ({ field, from: before[field], to: after[field] }));
}

/**
 * Design.md rule 4 again, after a merge: the groups of `productId` that are
 * now strictly identical fuse into the oldest (`planGroupFusion`, the same
 * rule and exceptions as the transformation: never a guessed group, a group
 * in a slot or in the trash, nor two groups counted in one inventory
 * session). The survivor takes the absorbed groups' tastings, history,
 * inventory entries, wishlist link and sub-records; units, value and
 * spending are unchanged. Run it in the transaction holding the family's
 * lock. Returns the ids of the groups removed.
 */
export async function fuseIdenticalGroups(tx: PrismaClientOrTx, productId: string, kind: ReturnType<typeof unitKind>, userId: string): Promise<string[]> {
  const units = (await tx.inventoryItem.findMany({
    where: { productId, deletedAt: null, writtenOffAt: null, needsReview: false, slotColumn: null, slotRow: null, ...OWNED_ITEM_FILTER },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })).filter(isIntactItem);
  if (units.length < 2) return [];
  const entries = await tx.inventoryCountEntry.findMany({
    where: { itemId: { in: units.map((unit) => unit.id) } },
    select: { itemId: true, sessionId: true },
  });
  const plan = planGroupFusion(units.map((unit) => ({
    ...unit,
    sessionIds: entries.filter((entry) => entry.itemId === unit.id).map((entry) => entry.sessionId),
  })), kind);

  const removed: string[] = [];
  for (const group of plan) {
    const members = [group.survivorId, ...group.absorbedIds].map((id) => units.find((unit) => unit.id === id)!);
    const all = Prisma.join(members.map((member) => member.id));
    const absorbed = Prisma.join(group.absorbedIds);
    // D15: an entry counted one group, now part of a larger one; it keeps
    // the number it found, so the others still show as missing.
    await tx.$executeRaw`UPDATE "inventory_count_entries" AS e SET "foundQuantity" = coalesce(e."foundQuantity", b."quantity")
      FROM "bottles" AS b WHERE b."id" = e."itemId" AND e."itemId" IN (${all})`;
    const sources: Record<string, string> = {};
    for (const member of members) {
      for (const [field, source] of Object.entries(fieldSourcesOf(member.fieldSources))) if (!(field in sources)) sources[field] = source;
    }
    await tx.inventoryItem.update({
      where: { id: group.survivorId },
      data: {
        quantity: group.quantity,
        purchasePlace: group.purchasePlace,
        location: group.location,
        lockedFields: [...new Set(members.flatMap((member) => member.lockedFields))].sort(),
        fieldSources: Object.keys(sources).length > 0 ? sources : Prisma.DbNull,
        updatedBy: userId,
      },
    });
    // Re-pointed in SQL, as the migration does: no `updatedAt` moves on what
    // only follows its group (a pending offline edit stays valid).
    await tx.$executeRaw`UPDATE "tasting_notes" SET "itemId" = ${group.survivorId} WHERE "itemId" IN (${absorbed})`;
    await tx.$executeRaw`UPDATE "audit_logs" SET "bottleId" = ${group.survivorId} WHERE "bottleId" IN (${absorbed})`;
    await tx.$executeRaw`UPDATE "inventory_count_entries" SET "itemId" = ${group.survivorId} WHERE "itemId" IN (${absorbed})`;
    await tx.$executeRaw`UPDATE "wishlist_items" SET "acquiredItemId" = ${group.survivorId} WHERE "acquiredItemId" IN (${absorbed})`;
    await tx.$executeRaw`UPDATE "bottles" SET "parentItemId" = ${group.survivorId} WHERE "parentItemId" IN (${absorbed})`;
    await tx.inventoryItem.deleteMany({ where: { id: { in: group.absorbedIds } } });
    removed.push(...group.absorbedIds);
  }
  return removed;
}

export interface MergeOutcome {
  productId: string;
  removedProductIds: string[];
  removedItemIds: string[];
  changes: FieldChange[];
  overLimits: MergeOverLimits;
}

export const reviewService = {
  /**
   * FEAT-102: what is left to review, shared by every member. "À
   * regrouper ?": listed families of the same wine (`productKey`, computed
   * here in TypeScript, D2) not declared different, with only their
   * disagreeing fields. Numbers to check: the groups the transformation
   * guessed (`needsReview`), with the bottle split off them. Empty lists
   * when nothing is left (c5).
   */
  async list(): Promise<ReviewList> {
    const families = await prisma.product.findMany({ where: LISTED_PRODUCT_FILTER });
    const keyed = families.map((family) => ({ family, key: productKey(family) }));
    const perKey = new Map<string, number>();
    for (const { key } of keyed) perKey.set(key, (perKey.get(key) ?? 0) + 1);
    const shared = keyed.filter(({ key }) => (perKey.get(key) ?? 0) > 1);
    const sharedIds = shared.map(({ family }) => family.id);
    const distinctions = sharedIds.length === 0 ? [] : await prisma.productDistinction.findMany({
      where: { productId: { in: sharedIds }, otherProductId: { in: sharedIds } },
      select: { productId: true, otherProductId: true },
    });
    const cases = formMergeCases(
      shared.map(({ family, key }) => ({ id: family.id, key, createdAt: family.createdAt })),
      distinctions.map((d) => [d.productId, d.otherProductId] as const),
    );

    const groups = await prisma.inventoryItem.findMany({
      where: { needsReview: true, deletedAt: null, product: LISTED_PRODUCT_FILTER },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const subRecords = groups.length === 0 ? [] : await prisma.inventoryItem.findMany({
      where: { parentItemId: { in: groups.map((group) => group.id) }, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const views = new Map((await productService.views([...cases.flat(), ...groups.map((group) => group.productId)]))
      .map((view) => [view.id, view]));
    const byId = new Map(families.map((family) => [family.id, family]));
    return {
      merges: cases.map((ids) => ({
        products: ids.map((id) => views.get(id)!),
        // What the merged card will hold: a merge never changes a count.
        units: ids.reduce((sum, id) => sum + summarizeStock(views.get(id)!.items, { kind: unitKind(byId.get(id)!.category) }).units, 0),
        disagreements: findDisagreements(ids.map((id) => byId.get(id)! as unknown as ReviewFamily)),
      })),
      counts: groups.map((group) => ({
        product: views.get(group.productId)!,
        group: toUnitView(group),
        subRecords: subRecords.filter((sub) => sub.parentItemId === group.id).map(toUnitView),
      })),
    };
  },

  /**
   * FEAT-102 c2 ("Regrouper"): the families of one wine become one — the
   * oldest survives, with the values chosen field by field. Its units,
   * tastings, history, collections and "other wine" memories gather there;
   * the groups now strictly identical fuse (rule 4). One transaction, the
   * families locked first in sorted order (lock rule).
   */
  async merge(userId: string, input: MergeRequest): Promise<MergeOutcome> {
    const ids = [...new Set(input.productIds)];
    if (ids.length < 2) throw badRequest('NOT_ENOUGH_FAMILIES');
    return prisma.$transaction(async (tx) => {
      const families = await lockedFamilies(tx, ids);
      await assertSameWine(tx, families);
      const walk = [...families].sort(byAge);
      const [survivor, ...others] = walk;
      const otherIds = others.map((family) => family.id);
      const data = mergedFamily(walk, input.choices);

      // In SQL like the description mirror (D22): a unit only changes family.
      const absorbed = Prisma.join(otherIds);
      await tx.$executeRaw`UPDATE "bottles" SET "productId" = ${survivor.id} WHERE "productId" IN (${absorbed})`;
      await tx.$executeRaw`UPDATE "tasting_notes" SET "productId" = ${survivor.id} WHERE "productId" IN (${absorbed})`;
      await tx.$executeRaw`UPDATE "audit_logs" SET "productId" = ${survivor.id} WHERE "productId" IN (${absorbed})`;
      await tx.$executeRaw`INSERT INTO "_CollectionProducts" ("A", "B")
        SELECT "A", ${survivor.id} FROM "_CollectionProducts" WHERE "B" IN (${absorbed}) ON CONFLICT DO NOTHING`;
      // "C'est un autre vin" with a third family holds for the merged one.
      const memories = await tx.productDistinction.findMany({
        where: { OR: [{ productId: { in: otherIds } }, { otherProductId: { in: otherIds } }] },
        select: { productId: true, otherProductId: true },
      });
      const kept = memories
        .map((pair) => (otherIds.includes(pair.productId) ? pair.otherProductId : pair.productId))
        .filter((third) => !ids.includes(third))
        .map((third) => orderedPair(survivor.id, third));
      if (kept.length > 0) {
        await tx.productDistinction.createMany({
          data: kept.map(([productId, otherProductId]) => ({ productId, otherProductId })),
          skipDuplicates: true,
        });
      }

      await writeProductFields(tx, survivor.id, { ...data, updatedBy: userId });
      await tx.product.deleteMany({ where: { id: { in: otherIds } } });
      const removedItemIds = await fuseIdenticalGroups(tx, survivor.id, unitKind(survivor.category), userId);
      return {
        productId: survivor.id, removedProductIds: otherIds, removedItemIds, changes: changesOn(survivor, data),
        // Kept whole, but the member must shorten them before saving the description again.
        overLimits: {
          notes: ((data.notes as string | null) ?? '').length > DESCRIPTION_LIMITS.notes,
          tags: (data.tags as string[]).length > DESCRIPTION_LIMITS.tags,
        },
      };
    });
  },

  /**
   * FEAT-102 c3 ("Garder séparées") and FEAT-97 ("C'est un autre vin"):
   * every pair of these families of one wine is remembered as two different
   * wines, so "À regrouper ?" never proposes them together again. Idempotent.
   */
  async distinguish(input: { productIds: string[] }): Promise<Array<[string, string]>> {
    const ids = [...new Set(input.productIds)];
    if (ids.length < 2) throw badRequest('NOT_ENOUGH_FAMILIES');
    return prisma.$transaction(async (tx) => {
      const families = await lockedFamilies(tx, ids);
      if (new Set(families.map(productKey)).size > 1) throw badRequest('NOT_SAME_WINE');
      const pairs = ids.flatMap((a, i) => ids.slice(i + 1).map((b) => orderedPair(a, b)));
      await tx.productDistinction.createMany({
        data: pairs.map(([productId, otherProductId]) => ({ productId, otherProductId })),
        skipDuplicates: true,
      });
      return pairs;
    });
  },

  /**
   * FEAT-102 c4 ("C'est bon"): the guessed number is right — nothing changes
   * but the mark (`needsReview`, point 55), for every member. Already
   * settled (by another member, or by "Corriger le nombre"): unchanged.
   * Null when the unit is unknown or in the trash.
   */
  async confirmCount(userId: string, itemId: string): Promise<{ item: ItemView; changed: boolean } | null> {
    const head = await prisma.inventoryItem.findFirst({ where: { id: itemId, deletedAt: null }, select: { productId: true } });
    if (!head) return null;
    return prisma.$transaction(async (tx) => {
      await lockFamily(tx, head.productId);
      const unit = await tx.inventoryItem.findFirst({ where: { id: itemId, deletedAt: null } });
      if (!unit) return null;
      // Merged into another family meanwhile: that family is the one to lock.
      if (unit.productId !== head.productId) await lockFamily(tx, unit.productId);
      if (!unit.needsReview) return { item: toUnitView(unit), changed: false };
      const settled = await tx.inventoryItem.update({ where: { id: itemId }, data: { needsReview: false, updatedBy: userId } });
      return { item: toUnitView(settled), changed: true };
    });
  },
};
