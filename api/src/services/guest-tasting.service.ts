import type { GuestShare } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { IN_STOCK_ITEM_FILTER, isFinishedState } from '../lib/finished-item';
import type { GuestTastingInput } from '../schemas/guest-tasting.schema';

/**
 * #471 (FEAT-109 c3, D16): a tasting noted by a guest goes on the wine (the
 * family), shown to the members like theirs.
 * - On the bottle tasted, when given: a bottle of that wine in a cellar the
 *   share opens with write access, the one just drunk included even when it
 *   was the last (decision #471 point 70) — not a written-off one. Without a
 *   bottle: a wine with a copy in stock in such a cellar. Else 403
 *   READ_ONLY_ACCESS, whether the wine is shared read-only or not at all.
 * - `userId` is the share's creator (as for GUEST_UPDATE); `guestName`
 *   copies the guest's name as it is now (the share may be deleted later):
 *   empty when the share names nobody, still telling a guest's tasting apart
 *   (shown "Invité", decision #471 point 64).
 * - A finished bottle only when this share finished it (its last write is
 *   this share's GUEST_UPDATE), or when it was finished less than
 *   {@link RECENTLY_FINISHED_MS} ago (review of #829): not any bottle drunk
 *   long ago in a cellar the share opens.
 */
/** How long a bottle finished by someone else still takes a guest's tasting. */
export const RECENTLY_FINISHED_MS = 24 * 60 * 60 * 1000;

/** Whether this share made the last write on that bottle (the one that finished it). */
async function finishedByShare(itemId: string, shareId: string): Promise<boolean> {
  const last = await prisma.auditLog.findFirst({
    where: { bottleId: itemId, status: 'success', action: { notIn: ['READ', 'LIST'] } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { action: true, details: true },
  });
  const details = (last?.details ?? {}) as { shareId?: unknown };
  return last?.action === 'GUEST_UPDATE' && details.shareId === shareId;
}

export async function createGuestTasting(
  share: Pick<GuestShare, 'id' | 'userId' | 'inviteeName' | 'writeCellarIds'>,
  input: GuestTastingInput,
) {
  const writeCellars = { cellarId: { in: share.writeCellarIds } };
  // Decision 70: the bottle just drunk counts, even the last one (finished:
  // out of stock) — a bottle of that wine in such a cellar, not written off.
  if (input.itemId) {
    const bottle = await prisma.inventoryItem.findFirst({
      where: { id: input.itemId, productId: input.productId, ...writeCellars, deletedAt: null, writtenOffAt: null },
      select: { id: true, isOpened: true, fillLevel: true, updatedAt: true },
    });
    if (!bottle) throw new AppError(403, 'READ_ONLY_ACCESS');
    const finishedLongAgo = isFinishedState(bottle) && Date.now() - bottle.updatedAt.getTime() >= RECENTLY_FINISHED_MS;
    if (finishedLongAgo && !(await finishedByShare(bottle.id, share.id))) throw new AppError(403, 'READ_ONLY_ACCESS');
  } else {
    const inStock = await prisma.inventoryItem.findFirst({
      where: { productId: input.productId, ...writeCellars, ...IN_STOCK_ITEM_FILTER },
      select: { id: true },
    });
    if (!inStock) throw new AppError(403, 'READ_ONLY_ACCESS');
  }
  const { tastedAt, ...fields } = input;
  return prisma.tastingNote.create({
    data: {
      ...fields,
      userId: share.userId,
      guestName: share.inviteeName?.trim() ?? '',
      tastedAt: tastedAt ? new Date(tastedAt) : new Date(),
    },
    select: {
      id: true, productId: true, itemId: true, guestName: true, tastedAt: true,
      rating: true, readiness: true, notes: true, foodPairing: true, createdAt: true,
    },
  });
}
