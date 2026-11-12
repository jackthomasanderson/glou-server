import type { Prisma } from '@prisma/client';
import { prisma, type PrismaClientOrTx } from '../lib/prisma';
import { isFinishedState, isIntactItem, itemUnits, type UnitState } from '../lib/finished-item';
import type {
  StockMovementAuthor, StockMovementCellar, StockMovementDetails, StockMovementKind, StockMovementView,
} from '../../../shared/stock-movement';

// #848 (FEAT-110, design.md "Journal des mouvements"): the movement journal
// of a wine. Every write of a number of bottles (cigars) or of their price
// records its movement here, in the transaction that makes it, whatever the
// path: the stock state rule (applyState: the form, a tasting, the
// consumption plan, a QR/NFC label, the offline queue at replay, a guest, a
// bulk "mark as drunk", a count closure), adding copies (form, scan, import,
// wishlist, count), correcting a number, moving or repricing part of a
// group, the bulk actions and the trash. A write replayed twice is stopped
// by its `expectedUpdatedAt` before it writes anything, so it is told once.

/** Who made a movement: a member, or a guest through the member's share. */
export interface MovementActor {
  userId: string;
  /** A guest's write (the share's invitee name, possibly empty): the member who shared the cellar is not its author. */
  guest?: { name: string | null };
}

/** A movement about to be written. */
export interface MovementDraft {
  productId: string;
  itemId: string | null;
  kind: StockMovementKind;
  delta: number;
  count: number;
  details?: StockMovementDetails;
}

type MovementShape = Pick<MovementDraft, 'kind' | 'delta' | 'count'>;

/** What a movement is read from: a unit's state and size, its cellar and its price. */
export type LineState = UnitState & { cellarId: string | null; purchasePrice: number | null };

/**
 * The movement of one copy whose state changed from `before` to `after`
 * (an opening, a drink, a cigar smoked, a bottle put back), or null when
 * the stock did not move (a level changed on an opened bottle). Pure.
 */
export function stateMovement(before: UnitState, after: UnitState): MovementShape | null {
  const delta = itemUnits(after) - itemUnits(before);
  const wasFinished = isFinishedState(before);
  const finished = isFinishedState(after);
  const wasIntact = isIntactItem(before);
  const intact = isIntactItem(after);
  if (!wasFinished && finished) return { kind: 'CONSUMED', delta, count: -delta };
  if (!wasIntact && intact) return { kind: 'PUT_BACK', delta, count: 1 };
  if (wasFinished && !finished) return { kind: 'UNFINISHED', delta, count: 1 };
  // A box opened by smoking its first cigar, or cigars smoked from an opened box.
  if (delta < 0) return { kind: 'CONSUMED', delta, count: -delta };
  if (wasIntact && !intact) return { kind: 'OPENED', delta, count: 1 };
  if (delta > 0) return { kind: 'CORRECTED', delta, count: delta };
  return null;
}

/**
 * The movements of a whole line whose cellar, price, number or box size
 * changed from `before` to `after` (an edit of the line, a restored value, a
 * bulk edit): a move, a new price, bottles added or the number corrected, the
 * cigars of a box size corrected. A line holding nothing in stock (finished,
 * written off) moves no stock. A change of state is told apart, by
 * {@link stateMovement} on the line as {@link alignedLine} leaves it. Pure.
 */
export function lineMovements(before: LineState, after: LineState): Omit<MovementDraft, 'productId' | 'itemId'>[] {
  if (itemUnits(before) === 0 && itemUnits(after) === 0) return [];
  const movements: Omit<MovementDraft, 'productId' | 'itemId'>[] = [];
  const copies = after.quantity ?? 1;
  const cellarId = before.cellarId;
  if (after.cellarId !== before.cellarId) {
    movements.push({ kind: 'MOVED', delta: 0, count: copies, details: { cellarId, fromCellarId: before.cellarId, toCellarId: after.cellarId } });
  }
  if ((after.purchasePrice ?? null) !== (before.purchasePrice ?? null)) {
    movements.push({ kind: 'PRICE_CHANGED', delta: 0, count: copies, details: { cellarId, fromPrice: before.purchasePrice, toPrice: after.purchasePrice } });
  }
  const from = before.quantity ?? 1;
  if (copies !== from) {
    const delta = itemUnits({ ...before, quantity: copies }) - itemUnits(before);
    if (delta > 0) movements.push({ kind: 'ADDED', delta, count: copies - from, details: { cellarId } });
    else if (delta < 0) movements.push({ kind: 'CORRECTED', delta, count: from - copies, details: { cellarId, from, to: copies } });
  }
  if ((after.cigarsPerBox ?? null) !== (before.cigarsPerBox ?? null)) {
    const sized = { ...before, quantity: copies };
    const delta = itemUnits({ ...sized, cigarsPerBox: after.cigarsPerBox }) - itemUnits(sized);
    if (delta !== 0) movements.push({ kind: 'CORRECTED', delta, count: Math.abs(delta), details: { cellarId } });
  }
  return movements;
}

/**
 * `before` with the number and box size of `after`: what is left to tell by
 * {@link stateMovement} once {@link lineMovements} told the line's own changes
 * — the sum of both is always the change of units in stock.
 */
export function alignedLine<T extends UnitState>(before: T, after: UnitState): T {
  return { ...before, quantity: after.quantity, cigarsPerBox: after.cigarsPerBox };
}

/**
 * Lines moved to the trash (`TRASHED`) or back from it (`RESTORED`): each
 * line still holding units in stock, with what it holds. A finished or
 * written-off line holds nothing: no movement of the stock.
 */
export function trashMovements(
  kind: 'TRASHED' | 'RESTORED',
  productId: string,
  rows: readonly (UnitState & { id: string; cellarId: string | null })[],
): MovementDraft[] {
  return rows.flatMap((row) => {
    const units = itemUnits(row);
    if (units === 0) return [];
    const copies = row.isOpened ? 1 : row.quantity ?? 1;
    return [{ productId, itemId: row.id, kind, delta: kind === 'TRASHED' ? -units : units, count: copies, details: { cellarId: row.cellarId } }];
  });
}

/**
 * Movements of one kind on the same line told as one, their differences and
 * copies added up: three bottles of a line drunk together (a bulk "mark as
 * drunk", a count closure) are "3 bouteilles bues, −3", not three lines.
 * The order of first appearance is kept.
 */
export function foldByLine(drafts: readonly MovementDraft[]): MovementDraft[] {
  const folded = new Map<string, MovementDraft>();
  for (const draft of drafts) {
    const key = `${draft.productId}|${draft.itemId}|${draft.kind}`;
    const seen = folded.get(key);
    if (seen) folded.set(key, { ...seen, delta: seen.delta + draft.delta, count: seen.count + draft.count });
    else folded.set(key, { ...draft });
  }
  return [...folded.values()];
}

/** Writes `drafts` in `client` (the transaction of the write they tell). */
export async function recordMovements(client: PrismaClientOrTx, actor: MovementActor, drafts: MovementDraft[]): Promise<void> {
  if (drafts.length === 0) return;
  await client.stockMovement.createMany({
    data: drafts.map((draft) => ({
      productId: draft.productId,
      itemId: draft.itemId,
      kind: draft.kind,
      delta: draft.delta,
      count: draft.count,
      ...(draft.details ? { details: draft.details as Prisma.InputJsonValue } : {}),
      userId: actor.guest ? null : actor.userId,
      guestName: actor.guest ? actor.guest.name ?? '' : null,
    })),
  });
}

/**
 * #661: an account anonymised by the deletion of personal data keeps its row
 * under a placeholder name (authService.purgeDueAccountDeletions): it is a
 * deleted member, never shown by that placeholder.
 */
const isErasedAccount = (user: { id: string; username: string }) => user.username === `deleted-${user.id}`;

/** A wine's movement journal, newest first (FEAT-110: date, author, movement, line, difference); null for an unknown wine. */
export async function listMovements(productId: string): Promise<StockMovementView[] | null> {
  if (!(await prisma.product.findUnique({ where: { id: productId }, select: { id: true } }))) return null;
  const rows = await prisma.stockMovement.findMany({
    where: { productId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  const detailsOf = (row: { details: Prisma.JsonValue }) => (row.details ?? {}) as StockMovementDetails;
  const userIds = [...new Set(rows.map((row) => row.userId).filter((id): id is string => id !== null))];
  const cellarIds = [...new Set(rows.flatMap((row) => {
    const details = detailsOf(row);
    return [details.cellarId, details.fromCellarId, details.toCellarId];
  }).filter((id): id is string => typeof id === 'string'))];
  const [users, cellars] = await Promise.all([
    userIds.length > 0 ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true, displayName: true } }) : [],
    cellarIds.length > 0 ? prisma.cellar.findMany({ where: { id: { in: cellarIds } }, select: { id: true, name: true } }) : [],
  ]);
  const userById = new Map(users.map((user) => [user.id, user]));
  const cellarName = new Map(cellars.map((cellar) => [cellar.id, cellar.name]));
  const cellarOf = (id: string | null | undefined): StockMovementCellar | null =>
    id ? { id, name: cellarName.get(id) ?? null } : null;

  const authorOf = (row: { kind: StockMovementKind; userId: string | null; guestName: string | null }): StockMovementAuthor => {
    if (row.userId) {
      const user = userById.get(row.userId);
      return user && !isErasedAccount(user) ? { kind: 'member', name: user.displayName ?? user.username } : { kind: 'deletedMember' };
    }
    if (row.guestName !== null) return { kind: 'guest', name: row.guestName === '' ? null : row.guestName };
    return row.kind === 'INITIAL' ? { kind: 'none' } : { kind: 'deletedMember' };
  };

  return rows.map((row) => {
    const details = detailsOf(row);
    return {
      id: String(row.id),
      kind: row.kind,
      delta: row.delta,
      count: row.count,
      author: authorOf(row),
      itemId: row.itemId,
      cellar: cellarOf(details.cellarId),
      ...('fromCellarId' in details ? { fromCellar: cellarOf(details.fromCellarId) } : {}),
      ...('toCellarId' in details ? { toCellar: cellarOf(details.toCellarId) } : {}),
      ...('fromPrice' in details ? { fromPrice: details.fromPrice ?? null } : {}),
      ...('toPrice' in details ? { toPrice: details.toPrice ?? null } : {}),
      ...(details.from !== undefined ? { from: details.from } : {}),
      ...(details.to !== undefined ? { to: details.to } : {}),
      ...(details.reason ? { reason: details.reason } : {}),
      createdAt: row.createdAt,
    };
  });
}
