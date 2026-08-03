import { prisma } from '../lib/prisma';
import { inventoryService } from './inventory.service';
import { notificationService } from './notification.service';
import { WishlistCreateInput, WishlistPatchInput, ConvertToInventoryInput } from '../schemas/wishlist.schema';
import { InventoryInput } from '../schemas/inventory.schema';

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
      ? `An observed price for <strong>${label}</strong> is now at or below your ceiling.`
      : `Un prix observé pour <strong>${label}</strong> est désormais inférieur ou égal à votre plafond.`}</p>`,
    '<ul>',
    `<li>${isEn ? 'Observed price' : 'Prix observé'}: ${item.lastSeenPrice}</li>`,
    `<li>${isEn ? 'Your ceiling' : 'Votre plafond'}: ${item.maxPrice}</li>`,
    '</ul>',
  ].join('');

  await notificationService.send({ userId, category: 'wishlist', subject, htmlBody });
}

/**
 * Bascule "souhait → inventaire" (feature.md critère d'acceptation):
 * creates a real, shared InventoryItem via inventoryService.createItem
 * (reused as-is — see collaboration note in inventory.service.ts) and marks
 * the wish 'acquired' with a link back to the created item, atomically.
 *
 * KNOWN LIMITATION (documented, not silently papered over): InventoryInput
 * requires `alcoholDegree` for 'spirit' and `quantity` for 'cigar' — fields a
 * wishlist entry never tracks. `additionalFields` lets the conversion form
 * supply them; if omitted, they default to 0 / targetQuantity respectively
 * so the transaction never fails, but the resulting item may need a manual
 * follow-up edit. TODO(FEAT-20): surface these as required fields in the
 * conversion form when category is 'spirit'/'cigar' instead of defaulting.
 */
export async function convertToInventory(userId: string, id: string, additionalFields: ConvertToInventoryInput) {
  const wish = await prisma.wishlistItem.findFirst({ where: { id, userId } });
  if (!wish || wish.status !== 'active') return null;

  const base = {
    name: wish.name,
    producer: wish.producer ?? '',
    tags: [],
    isOpened: false,
    alertStatus: 'none' as const,
    purchasePrice: additionalFields.purchasePrice ?? wish.lastSeenPrice ?? undefined,
    purchasePlace: additionalFields.purchasePlace ?? undefined,
    cellarId: additionalFields.cellarId ?? undefined,
    bottleSize: additionalFields.bottleSize ?? undefined,
    lockedFields: [],
  };

  let inventoryInput: InventoryInput;
  switch (wish.category) {
    case 'wine':
      inventoryInput = { ...base, category: 'wine', vintage: wish.vintage ?? undefined, grapeVarieties: [] };
      break;
    case 'sparkling':
      inventoryInput = { ...base, category: 'sparkling', vintage: wish.vintage ?? undefined };
      break;
    case 'spirit':
      inventoryInput = { ...base, category: 'spirit', alcoholDegree: 0 };
      break;
    case 'cigar':
      inventoryInput = { ...base, category: 'cigar', quantity: additionalFields.quantity ?? wish.targetQuantity };
      break;
  }

  return prisma.$transaction(async (tx) => {
    const created = await inventoryService.createItem(userId, inventoryInput, tx);
    const updatedWish = await tx.wishlistItem.update({
      where: { id: wish.id },
      data: { status: 'acquired', acquiredItemId: created.id },
    });
    return { wishlistItem: updatedWish, inventoryItem: created };
  });
}
