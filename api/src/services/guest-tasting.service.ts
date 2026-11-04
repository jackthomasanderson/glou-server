import type { GuestShare } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { IN_STOCK_ITEM_FILTER } from '../lib/finished-item';
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
 */
export async function createGuestTasting(
  share: Pick<GuestShare, 'userId' | 'inviteeName' | 'writeCellarIds'>,
  input: GuestTastingInput,
) {
  const writeCellars = { cellarId: { in: share.writeCellarIds } };
  // Decision 70: the bottle just drunk counts, even the last one (finished:
  // out of stock) — a bottle of that wine in such a cellar, not written off.
  const allowed = input.itemId
    ? await prisma.inventoryItem.findFirst({
      where: { id: input.itemId, productId: input.productId, ...writeCellars, deletedAt: null, writtenOffAt: null },
      select: { id: true },
    })
    : await prisma.inventoryItem.findFirst({
      where: { productId: input.productId, ...writeCellars, ...IN_STOCK_ITEM_FILTER },
      select: { id: true },
    });
  if (!allowed) throw new AppError(403, 'READ_ONLY_ACCESS');
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
