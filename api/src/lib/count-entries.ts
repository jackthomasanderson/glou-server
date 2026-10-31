import type { Prisma } from '@prisma/client';
import type { PrismaClientOrTx } from './prisma';

/**
 * #471 (FEAT-100, D15): what a rotating-inventory entry says when the line it
 * counted changes under it. An entry's `foundQuantity` null means "the whole
 * line was found"; once the line's number changes that reading would be
 * wrong, so these helpers turn it into an explicit number first.
 */

const OPEN_SESSION = { status: { in: ['active', 'paused'] } } satisfies Prisma.InventoryCountSessionWhereInput;

/**
 * Moves a count entry onto the line `to` (a sub-record put back in its group,
 * a find joining a group), keeping the number it found. One entry per line
 * and session: when `to` is already counted in that session, the numbers add
 * up on its entry and the moved one is deleted.
 * `to.quantityBefore`: the line's number before the move — what a null
 * `foundQuantity` on its own entry stood for.
 */
export async function moveCountEntry(
  tx: PrismaClientOrTx,
  entry: { id: string; sessionId: string },
  found: number,
  to: { id: string; quantityBefore: number },
  status?: 'confirmed' | 'unexpected',
): Promise<void> {
  const existing = await tx.inventoryCountEntry.findFirst({ where: { sessionId: entry.sessionId, itemId: to.id, id: { not: entry.id } } });
  if (existing) {
    await tx.inventoryCountEntry.update({
      where: { id: existing.id },
      data: { foundQuantity: (existing.foundQuantity ?? to.quantityBefore) + found },
    });
    await tx.inventoryCountEntry.delete({ where: { id: entry.id } });
    return;
  }
  await tx.inventoryCountEntry.update({
    where: { id: entry.id },
    data: { itemId: to.id, foundQuantity: found, ...(status ? { status } : {}) },
  });
}

/**
 * A copy left group `groupId` during an open count (opened, drunk): the
 * group's number found can no longer exceed what it holds (no false surplus),
 * and an opened copy still on the shelf counted is not reported missing.
 */
export async function followDetach(
  tx: PrismaClientOrTx,
  groupId: string,
  quantity: number,
  sub: { id: string; cellarId: string | null; finished: boolean },
): Promise<void> {
  await tx.inventoryCountEntry.updateMany({
    where: { itemId: groupId, foundQuantity: { gt: quantity }, session: OPEN_SESSION },
    data: { foundQuantity: quantity },
  });
  if (sub.finished || !sub.cellarId) return;
  const session = await tx.inventoryCountSession.findFirst({ where: { ...OPEN_SESSION, cellarId: sub.cellarId }, select: { id: true } });
  if (session) await tx.inventoryCountEntry.create({ data: { sessionId: session.id, itemId: sub.id, status: 'confirmed' } });
}
