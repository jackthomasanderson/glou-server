import { prisma } from '../lib/prisma';
import { inventoryService } from './inventory.service';
import { addUnitsIn, lockedListedFamily } from './stock.service';
import { badRequest } from '../lib/errors';
import { namesSameWine } from '../../../shared/units';
import { rememberDistinct } from './review.service';
import { notificationService } from './notification.service';
import { escapeHtml } from '../lib/html';
import { WishlistCreateInput, WishlistPatchInput, ConvertToInventoryInput } from '../schemas/wishlist.schema';
import { InventoryDraft } from '../schemas/inventory.schema';

/**
 * FEAT-20: Liste de Souhaits & Pilotage Budgétaire.
 *
 * IMPORTANT — this service is deliberately scoped by `userId` throughout
 * (list/get/update/delete/recordPriceSeen/convertToInventory all filter on
 * the calling user). This does NOT violate the design.md "userId = audit
 * only, never an access filter" invariant: that invariant governs INVENTORY
 * entities (bottles, cellars — shared across the whole instance). A
 * WishlistItem is a personal planning artifact by design (see feature.md
 * decision, same reasoning as ConsumptionGoal in consumption-plan.service.ts)
 * — nobody else's wishlist should be visible or editable by another member.
 * Once converted, the resulting InventoryItem is fully shared like any other
 * bottle (inventoryService.createItem does not filter by userId).
 */

export type WishlistItemDTO = Awaited<ReturnType<typeof prisma.wishlistItem.findFirst>>;

export async function listWishlist(userId: string) {
  return prisma.wishlistItem.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getWishlistItem(userId: string, id: string) {
  return prisma.wishlistItem.findFirst({ where: { id, userId } });
}

export async function createWishlistItem(userId: string, input: WishlistCreateInput) {
  return prisma.wishlistItem.create({
    data: {
      userId,
      name: input.name,
      producer: input.producer ?? null,
      category: input.category,
      vintage: input.vintage ?? null,
      targetQuantity: input.targetQuantity,
      maxPrice: input.maxPrice ?? null,
      notes: input.notes ?? null,
    },
  });
}

export async function updateWishlistItem(userId: string, id: string, patch: WishlistPatchInput) {
  const existing = await prisma.wishlistItem.findFirst({ where: { id, userId } });
  if (!existing) return null;
  return prisma.wishlistItem.update({ where: { id }, data: patch });
}

export async function deleteWishlistItem(userId: string, id: string): Promise<boolean> {
  const existing = await prisma.wishlistItem.findFirst({ where: { id, userId } });
  if (!existing) return false;
  await prisma.wishlistItem.delete({ where: { id } });
  return true;
}

/**
 * Records a manually-observed price for a wish (feature.md: "la détection
 * d'opportunité repose sur la saisie manuelle de prix ... aucun service
 * tiers de prix n'est configuré" — no external price feed exists in this
 * project, see design.md "APIs Tierces" roadmap). If the observed price is
 * at or below the user's ceiling (`maxPrice`), a `wishlist` category
 * notification is fired. Notification dispatch is fire-and-forget: a
 * failure there must never fail the price-recording call itself.
 */
export async function recordPriceSeen(userId: string, id: string, price: number): Promise<WishlistItemDTO | null> {
  const existing = await prisma.wishlistItem.findFirst({ where: { id, userId } });
  if (!existing) return null;

  const item = await prisma.wishlistItem.update({
    where: { id },
    data: { lastSeenPrice: price, lastSeenAt: new Date() },
  });

  if (existing.maxPrice != null && price <= existing.maxPrice) {
    void notifyOpportunity(userId, item).catch((err) => {
      console.error('[wishlist] Failed to send opportunity notification:', err);
    });
  }

  return item;
}

async function notifyOpportunity(userId: string, item: NonNullable<WishlistItemDTO>): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { language: true, notifLanguage: true } });
  if (!user) return;
  const isEn = (user.notifLanguage ?? user.language) === 'EN';

  const label = [item.name, item.producer, item.vintage ? `(${item.vintage})` : null].filter(Boolean).join(' ');
  const subject = isEn ? `Price opportunity: ${label}` : `Opportunité tarifaire : ${label}`;
  const htmlBody = [
    `<p>${isEn
      ? `An observed price for <strong>${escapeHtml(label)}</strong> is now at or below your ceiling.`
      : `Un prix observé pour <strong>${escapeHtml(label)}</strong> est désormais inférieur ou égal à votre plafond.`}</p>`,
    '<ul>',
    `<li>${isEn ? 'Observed price' : 'Prix observé'}: ${escapeHtml(item.lastSeenPrice)}</li>`,
    `<li>${isEn ? 'Your ceiling' : 'Votre plafond'}: ${escapeHtml(item.maxPrice)}</li>`,
    '</ul>',
  ].join('');

  await notificationService.send({ userId, category: 'wishlist', subject, htmlBody });
}

/**
 * Bascule "souhait → inventaire" (feature.md critère d'acceptation):
 * creates a real, shared InventoryItem via inventoryService.createItem
 * (reused as-is — see collaboration note in inventory.service.ts) and marks
 * the wish 'acquired' with a link back to the created item, atomically.
 * #471 (FEAT-92, decision point 15): the bottles bought form one group of
 * the number wished for (`targetQuantity`), or of the number given at the
 * conversion, dated today (D6).
 *
 * Concurrency: the wish is claimed (`active` → `acquired`) first in the
 * transaction — a second conversion of the same wish (double tap, two
 * devices) waits on that row, then finds it taken and creates nothing.
 * Lock order (#787): the bottles go to a family created in this very
 * transaction, which no other one can hold — no family lock to take — or,
 * #471 (FEAT-97 c4), to the known wine `productId` ("Vous avez déjà ce
 * vin"), whose lock `addUnitsIn` takes before writing: they complete its
 * identical line (same cellar, price, size, bought today) or form a new one.
 * `distinctFrom` ("C'est un autre vin") remembers the new wine apart.
 *
 * A wishlist entry never tracks a spirit's ABV: it is left unknown (#587),
 * and editing the spirit asks for it.
 */
export async function convertToInventory(userId: string, id: string, additionalFields: ConvertToInventoryInput) {
  const wish = await prisma.wishlistItem.findFirst({ where: { id, userId } });
  if (!wish || wish.status !== 'active') return null;

  // Kept strictly to fields declared on EVERY InventoryInput variant
  // (commonInventorySchema) — `bottleSize` is only valid on wine/sparkling/
  // spirit (not cigar), so it is added per-branch below rather than here,
  // to avoid leaking an invalid property into the cigar variant.
  const base = {
    name: wish.name,
    producer: wish.producer ?? '',
    tags: [],
    isOpened: false,
    alertStatus: 'none' as const,
    purchasePrice: additionalFields.purchasePrice ?? wish.lastSeenPrice ?? undefined,
    purchasePlace: additionalFields.purchasePlace ?? undefined,
    cellarId: additionalFields.cellarId ?? undefined,
    lockedFields: [],
  };
  const bottleSize = additionalFields.bottleSize ?? undefined;
  const quantity = additionalFields.quantity ?? wish.targetQuantity;
  // FEAT-95: closed boxes of M cigars, else single cigars (never on bottles).
  const cigarsPerBox = additionalFields.cigarsPerBox ?? null;
  if (cigarsPerBox !== null && wish.category !== 'cigar') throw badRequest('CIGARS_PER_BOX_FOR_CIGARS_ONLY');

  let inventoryInput: InventoryDraft;
  switch (wish.category) {
    case 'wine':
      inventoryInput = { ...base, category: 'wine', vintage: wish.vintage ?? undefined, grapeVarieties: [], bottleSize, quantity };
      break;
    case 'sparkling':
      inventoryInput = { ...base, category: 'sparkling', vintage: wish.vintage ?? undefined, bottleSize, quantity };
      break;
    case 'spirit':
      // #587: a wish records no ABV — left unknown, never an invented 0 %.
      inventoryInput = { ...base, category: 'spirit', bottleSize, quantity };
      break;
    case 'cigar':
      inventoryInput = { ...base, category: 'cigar', quantity, cigarsPerBox };
      break;
  }

  const { productId, distinctFrom = [] } = additionalFields;
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.wishlistItem.updateMany({
      where: { id: wish.id, userId, status: 'active' },
      data: { status: 'acquired' },
    });
    if (claimed.count === 0) return null;
    let created: { id: string; productId: string };
    if (productId !== undefined) {
      // FEAT-97 c4: the bottles join the known wine, bought today (its lock
      // taken there, before any bottle is written).
      // Only the wine wished for (a cigar wish has no vitola: any vitola of it).
      const family = await lockedListedFamily(tx, productId);
      const wished = { category: wish.category, producer: wish.producer ?? '', name: wish.name, vintage: wish.vintage ?? null, format: null };
      if (!namesSameWine(wished, family, true)) throw badRequest('NOT_SAME_WINE');
      const added = await addUnitsIn(tx, userId, productId, {
        quantity, cellarId: base.cellarId, purchasePrice: base.purchasePrice,
        ...(wish.category === 'cigar' ? { cigarsPerBox } : { bottleSize }),
      });
      created = added.result.data;
    } else {
      created = await inventoryService.createItem(userId, inventoryInput, tx);
      // FEAT-97 c5: "C'est un autre vin".
      if (distinctFrom.length > 0) await rememberDistinct(tx, created.productId, distinctFrom);
    }
    const updatedWish = await tx.wishlistItem.update({
      where: { id: wish.id },
      data: { acquiredItemId: created.id },
    });
    return { wishlistItem: updatedWish, inventoryItem: created };
  });
}
