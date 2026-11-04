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
 * - A finished bottle only when this share finished it (the write that
 *   emptied it is this share's GUEST_UPDATE), or when it was finished less than
 *   {@link RECENTLY_FINISHED_MS} ago (review of #829): not any bottle drunk
 *   long ago in a cellar the share opens.
 */
/** How long a bottle finished by someone else still takes a guest's tasting. */
export const RECENTLY_FINISHED_MS = 24 * 60 * 60 * 1000;

/** A state write (member or guest) that left the bottle empty: the one that finished it. */
const FINISHING_ACTIONS = ['UPDATE', 'GUEST_UPDATE'];
type Change = { field?: unknown; to?: unknown };
const emptiesBottle = (details: unknown) =>
  ((details as { changes?: Change[] } | null)?.changes ?? []).some((change) => change.field === 'fillLevel' && change.to === 0);

/**
 * Whether a guest of this share may still note a tasting on a finished
 * bottle: the write that finished it (not the last write of any kind — a
 * tasting, a move or a new price after it changes nothing) was this share's,
 * or was made less than {@link RECENTLY_FINISHED_MS} ago. No such write
 * found: refused.
 */
async function mayTasteFinished(itemId: string, shareId: string): Promise<boolean> {
  const writes = await prisma.auditLog.findMany({
    where: { bottleId: itemId, status: 'success', action: { in: FINISHING_ACTIONS } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 50,
    select: { action: true, details: true, createdAt: true },
  });
  const finishing = writes.find((write) => emptiesBottle(write.details));
  if (!finishing) return false;
  const byThisShare = finishing.action === 'GUEST_UPDATE' && (finishing.details as { shareId?: unknown } | null)?.shareId === shareId;
  return byThisShare || Date.now() - finishing.createdAt.getTime() < RECENTLY_FINISHED_MS;
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
      select: { id: true, isOpened: true, fillLevel: true },
    });
    if (!bottle) throw new AppError(403, 'READ_ONLY_ACCESS');
    if (isFinishedState(bottle) && !(await mayTasteFinished(bottle.id, share.id))) throw new AppError(403, 'READ_ONLY_ACCESS');
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
