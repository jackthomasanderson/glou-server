import type { Prisma } from '@prisma/client';
import { prisma, type PrismaClientOrTx } from '../lib/prisma';
import { AppError, badRequest } from '../lib/errors';
import { productKey } from '../lib/finished-item';
import { TastingCreateInput, TastingPatchInput, TastedWineInput } from '../schemas/tastings.schema';
import { computeAlertStatus } from './alert.service';
import { LISTED_PRODUCT_FILTER } from './product.service';

/** #471 (lot Z): the bottle's description is its family's, served flat on `item` as before. */
const ITEM_DESCRIPTION_SELECT = {
  name: true,
  producer: true,
  category: true,
  photoUrl: true,
  color: true,
  spiritType: true,
  sparklingType: true,
  format: true,
} as const satisfies Prisma.ProductSelect;

const ITEM_SELECT = {
  id: true,
  product: { select: ITEM_DESCRIPTION_SELECT },
} as const satisfies Prisma.InventoryItemSelect;

/** #471: the wine (family) a tasting is of — the only one when it was tasted elsewhere. */
const PRODUCT_SELECT = {
  id: true,
  name: true,
  producer: true,
  category: true,
  vintage: true,
  photoUrl: true,
  color: true,
  spiritType: true,
  sparklingType: true,
  format: true,
} as const;

const NOTE_INCLUDE = { item: { select: ITEM_SELECT }, product: { select: PRODUCT_SELECT } } as const satisfies Prisma.TastingNoteInclude;

type NoteRow = Prisma.TastingNoteGetPayload<{ include: typeof NOTE_INCLUDE }>;

/** A tasting as served: its bottle (if any) with its family's description, flat. */
function servedNote({ item, ...note }: NoteRow) {
  return { ...note, item: item ? { id: item.id, ...item.product } : null };
}

/**
 * Key space of the advisory lock taken while a wine tasted elsewhere is
 * looked up then created (two int4 keys: never the CSV import's bigint key).
 */
const TASTED_WINE_LOCK_SPACE = 471107;

const DEFAULT_PAGE_SIZE = 20;

// Analytics top/flop item rankings.
const TOP_ITEMS_SIZE = 5;
// Minimum number of distinct rated items before a "lowest-rated" list is
// worth showing at all (ISSUE_038).
const MIN_ITEMS_FOR_FLOP = 10;

/**
 * The wine a tasting elsewhere goes on: the oldest listed wine of the same
 * `productKey`, else a new one without any bottle. Serialised per wine name,
 * so two tastings of one new wine noted at once make one wine, not two.
 */
async function tastedWine(tx: PrismaClientOrTx, userId: string, wine: TastedWineInput): Promise<string> {
  const isCigar = wine.category === 'cigar';
  // What `productKey` reads: a cigar is told apart by its vitola, any other
  // wine by its vintage (a spirit's included), so a wine named twice is found.
  const vintage = isCigar ? null : wine.vintage ?? null;
  const format = isCigar ? wine.format?.trim() || null : null;
  const key = productKey({ category: wine.category, producer: wine.producer, name: wine.name, vintage, format });
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${TASTED_WINE_LOCK_SPACE}::int, hashtext(${key}))`;
  const candidates = await tx.product.findMany({
    where: { ...LISTED_PRODUCT_FILTER, category: wine.category, producer: { contains: wine.producer.trim(), mode: 'insensitive' } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const known = candidates.find((product) => productKey(product) === key);
  if (known) return known.id;
  const description = {
    name: wine.name,
    producer: wine.producer,
    ...(vintage !== null ? { vintage } : {}),
    ...(format !== null ? { format } : {}),
  };
  const created = await tx.product.create({
    data: { userId, category: wine.category, ...description, alertStatus: computeAlertStatus(null, null) },
    select: { id: true },
  });
  return created.id;
}

export const tastingsService = {
  // `search` (FEAT-09) filters the consumption history by dish (foodPairing)
  // or bottle (item name/producer) — a single free-text field covers both
  // acceptance criteria ("filtré par met ou bouteille") without requiring
  // two separate controls.
  //
  // Tasting notes are part of the shared inventory's collective history
  // (design.md invariant: userId is an audit field, not an access filter —
  // see also FEAT-62 on visible collective contributions). Every member sees
  // every tasting note, not just the ones they personally logged; `_userId`
  // is kept for signature stability with the router but unused here.
  //
  // #471 (FEAT-107): the journal lists every tasting, with or without a
  // bottle — a wine tasted elsewhere is found by its wine's name too.
  async list(_userId: string, page = 1, limit = DEFAULT_PAGE_SIZE, itemId?: string, search?: string, productId?: string) {
    const skip = (page - 1) * limit;
    const trimmedSearch = search?.trim();
    const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });
    const where: Prisma.TastingNoteWhereInput = {
      ...(itemId ? { itemId } : {}),
      ...(productId ? { productId } : {}),
      ...(trimmedSearch
        ? {
            OR: [
              { foodPairing: contains(trimmedSearch) },
              { product: { is: { name: contains(trimmedSearch) } } },
              { product: { is: { producer: contains(trimmedSearch) } } },
            ],
          }
        : {}),
    };
    const [notes, total] = await Promise.all([
      prisma.tastingNote.findMany({
        where,
        include: NOTE_INCLUDE,
        orderBy: { tastedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.tastingNote.count({ where }),
    ]);
    return { notes: notes.map(servedNote), total, page, limit };
  },

  /**
   * #471 (FEAT-107): a tasting is of a wine (the family). Of a bottle of the
   * cellar (`itemId`): that bottle's wine. Of a known wine tasted elsewhere
   * (`productId`): that wine alone, the stock untouched. Of a wine named
   * (`wine`): the wine of the same `productKey` when Glou knows it, else a
   * new wine without any bottle ("Plus en cave", FEAT-101).
   */
  async create(userId: string, data: TastingCreateInput) {
    const { wine, productId: givenProductId, ...fields } = data;
    const write = async (client: PrismaClientOrTx, productId: string | undefined) => servedNote(await client.tastingNote.create({
      data: {
        userId, // audit: who logged this tasting note
        ...fields,
        productId,
        tastedAt: fields.tastedAt ? new Date(fields.tastedAt) : new Date(),
      },
      include: NOTE_INCLUDE,
    }));

    if (wine) return prisma.$transaction(async (tx) => write(tx, await tastedWine(tx, userId, wine)));

    let productId = givenProductId;
    if (fields.itemId) {
      // Shared inventory: any item in the instance can be tasted/logged
      // against, not just the ones the current user created.
      const item = await prisma.inventoryItem.findFirst({
        where: { id: fields.itemId, deletedAt: null },
        select: { productId: true },
      });
      if (!item) throw new AppError(404, 'ITEM_NOT_FOUND');
      if (productId && productId !== item.productId) throw badRequest('ITEM_NOT_IN_PRODUCT');
      // #471: the tasting belongs to the wine (the family) of the bottle.
      productId = item.productId;
    } else if (productId) {
      // A wine in the trash is not offered: it is restored first.
      const product = await prisma.product.findFirst({ where: { id: productId, ...LISTED_PRODUCT_FILTER }, select: { id: true } });
      if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND');
    }
    return write(prisma, productId);
  },

  // Any member can edit/delete any tasting note — full read/write access to
  // the shared inventory (design.md roles table), not just the note's author.
  async update(id: string, _userId: string, data: TastingPatchInput) {
    const existing = await prisma.tastingNote.findFirst({ where: { id } });
    if (!existing) return null;
    // #471: a tasting moves to another bottle of its wine, never to another
    // wine (FEAT-107, out of scope); a tasting not yet on a wine follows the
    // bottle's. Its own bottle resent unchanged is no move: it may be in the
    // trash by now (or its wine), and the tasting must still be editable.
    const moved = data.itemId !== undefined && data.itemId !== existing.itemId;
    const item = moved
      ? await prisma.inventoryItem.findFirst({ where: { id: data.itemId, deletedAt: null }, select: { productId: true } })
      : null;
    if (moved && !item) throw new AppError(404, 'ITEM_NOT_FOUND');
    if (item && existing.productId && item.productId !== existing.productId) throw badRequest('ITEM_NOT_IN_PRODUCT');
    return servedNote(await prisma.tastingNote.update({
      where: { id },
      data: {
        ...data,
        ...(item ? { productId: item.productId } : {}),
        tastedAt: data.tastedAt ? new Date(data.tastedAt) : undefined,
      },
      include: NOTE_INCLUDE,
    }));
  },

  async delete(id: string, _userId: string) {
    const existing = await prisma.tastingNote.findFirst({ where: { id } });
    if (!existing) return null;
    return prisma.tastingNote.delete({ where: { id } });
  },

  /** FEAT-79 over the wine (#471): every tasting of the bottle's wine, whichever bottle it was. */
  async itemStats(_userId: string, itemId: string) {
    const item = await prisma.inventoryItem.findFirst({ where: { id: itemId }, select: { productId: true } });
    const notes = await prisma.tastingNote.findMany({
      where: item ? { productId: item.productId } : { itemId },
      select: { rating: true, readiness: true, tastedAt: true },
      orderBy: { tastedAt: 'desc' },
    });
    if (notes.length === 0) return null;
    const rated = notes.filter((n) => n.rating != null);
    const avgRating = rated.length > 0
      ? Math.round((rated.reduce((s, n) => s + n.rating!, 0) / rated.length) * 10) / 10
      : null;
    const last = notes[0];
    return {
      count: notes.length,
      avgRating,
      lastTastedAt: last.tastedAt,
      lastRating: last.rating ?? null,
      lastReadiness: last.readiness ?? null,
    };
  },

  async analytics(_userId: string) {
    const notes = await prisma.tastingNote.findMany({
      // #471 (FEAT-107): by wine (family), a tasting elsewhere included.
      where: { productId: { not: null } },
      select: {
        rating: true,
        readiness: true,
        product: { select: { id: true, name: true, producer: true } },
      },
    });

    // Producer rankings
    const byProducer: Record<string, { ratings: number[]; producer: string }> = {};
    for (const n of notes) {
      if (!n.product?.producer || n.rating == null) continue;
      const key = n.product.producer;
      if (!byProducer[key]) byProducer[key] = { ratings: [], producer: key };
      byProducer[key].ratings.push(n.rating);
    }
    const producerRankings = Object.values(byProducer)
      .map((p) => ({
        producer: p.producer,
        avgRating: Math.round((p.ratings.reduce((s, r) => s + r, 0) / p.ratings.length) * 10) / 10,
        count: p.ratings.length,
      }))
      .sort((a, b) => b.avgRating - a.avgRating);

    // Item top/flop
    const byItem: Record<string, { ratings: number[]; name: string; producer: string }> = {};
    for (const n of notes) {
      if (!n.product || n.rating == null) continue;
      const key = n.product.id;
      if (!byItem[key]) byItem[key] = { ratings: [], name: n.product.name, producer: n.product.producer };
      byItem[key].ratings.push(n.rating);
    }
    const itemStats = Object.entries(byItem)
      .map(([id, v]) => ({
        id,
        name: v.name,
        producer: v.producer,
        avgRating: Math.round((v.ratings.reduce((s, r) => s + r, 0) / v.ratings.length) * 10) / 10,
        count: v.ratings.length,
      }))
      .filter((i) => i.count >= 1)
      .sort((a, b) => b.avgRating - a.avgRating);

    const topItems = itemStats.slice(0, TOP_ITEMS_SIZE);
    // The two lists are cut from the same sorted array, so they would overlap
    // on a small cellar — with a single rated item it would be both the best
    // and the worst. Below MIN_ITEMS_FOR_FLOP the flop list carries no
    // information, so it stays empty and the client hides the card; above it,
    // the top slice is excluded before taking the tail.
    const flopItems = itemStats.length >= MIN_ITEMS_FOR_FLOP
      ? itemStats.slice(TOP_ITEMS_SIZE).slice(-TOP_ITEMS_SIZE).reverse()
      : [];

    // Readiness distribution
    const readinessCounts = { TOO_YOUNG: 0, PERFECT: 0, PEAK: 0, PAST: 0 };
    for (const n of notes) {
      if (n.readiness && n.readiness in readinessCounts) {
        readinessCounts[n.readiness as keyof typeof readinessCounts]++;
      }
    }

    return { producerRankings, topItems, flopItems, readinessDistribution: readinessCounts };
  },
};
