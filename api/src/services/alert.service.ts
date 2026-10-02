import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { CurveShape, readinessPercent } from '../lib/maturity-curve';

export type AlertStatus = 'none' | 'approaching' | 'peak' | 'past';

/**
 * Computes the drinking window alert status from structured peak maturity years.
 * Returns 'none' if no window is defined.
 * Ignores alertsPaused — caller decides whether to suppress display.
 */
export function computeAlertStatus(
  peakMaturityFrom: number | null | undefined,
  peakMaturityTo: number | null | undefined,
): AlertStatus {
  if (!peakMaturityFrom && !peakMaturityTo) return 'none';

  const currentYear = new Date().getFullYear();
  const from = peakMaturityFrom ?? peakMaturityTo!;
  const to = peakMaturityTo ?? peakMaturityFrom!;

  if (currentYear < from) return 'approaching';
  if (currentYear > to) return 'past';
  return 'peak';
}

/**
 * FEAT-86: the fine-grained companion to `computeAlertStatus`. Returns an
 * integer readiness percentage in [0, 100] for the given curve shape and
 * window, or `null` when there is no window at all (fall back to the coarse
 * status). Pure passthrough to the shared curve model — kept here so callers
 * that already import the alert service don't need a second import.
 */
export function computeReadiness(
  curveShape: CurveShape | null | undefined,
  peakMaturityFrom: number | null | undefined,
  peakMaturityTo: number | null | undefined,
  year?: number,
): number | null {
  return readinessPercent({ shape: curveShape, from: peakMaturityFrom, to: peakMaturityTo, year });
}

/**
 * Matches every active item that has at least one end of a drinking window
 * defined — i.e. exactly the population for which `computeAlertStatus` can
 * return something other than 'none'. Shared by `getAlerts` (read path) and
 * `recomputeAlertStatuses` (maintenance path) so both always agree on the
 * set of items an alert can possibly apply to.
 */
const HAS_MATURITY_WINDOW = {
  deletedAt: null,
  OR: [{ peakMaturityFrom: { not: null } }, { peakMaturityTo: { not: null } }],
} satisfies Prisma.InventoryItemWhereInput;

/**
 * Returns all active (non-deleted) inventory items with a computed alert status,
 * excluding paused alerts and 'none' status.
 * Sorted by urgency: past → peak → approaching.
 * Each row also carries a FEAT-86 `readiness` percentage (null when the curve
 * model has nothing to work with).
 *
 * The status is computed on read and never taken from the denormalised
 * `InventoryItem.alertStatus` column: that column only changes when someone
 * edits the item, so a bottle whose window opens next January would otherwise
 * stay invisible here until it happens to be edited (ISSUE_033). The column is
 * still maintained — see `recomputeAlertStatuses` — for the consumers that
 * aggregate it in SQL, but this user-facing list is always exact.
 */
export async function getAlerts() {
  const items = await prisma.inventoryItem.findMany({
    where: { ...HAS_MATURITY_WINDOW, alertsPaused: false },
    orderBy: [{ updatedAt: 'desc' }],
    select: {
      id: true,
      name: true,
      producer: true,
      category: true,
      vintage: true,
      peakMaturityFrom: true,
      peakMaturityTo: true,
      curveShape: true,
      alertsPaused: true,
      cellarId: true,
      collection: true,
      photoUrl: true,
    },
  });

  const urgencyOrder: Record<AlertStatus, number> = { past: 0, peak: 1, approaching: 2, none: 3 };
  return items
    .map((item) => ({
      ...item,
      alertStatus: computeAlertStatus(item.peakMaturityFrom, item.peakMaturityTo),
      readiness: computeReadiness(item.curveShape, item.peakMaturityFrom, item.peakMaturityTo),
    }))
    .filter((item) => item.alertStatus !== 'none')
    .sort((a, b) => urgencyOrder[a.alertStatus] - urgencyOrder[b.alertStatus]);
}

export interface AlertStatusRecomputeResult {
  /** Items carrying a drinking window, i.e. the rows actually examined. */
  scanned: number;
  /** Rows whose stored status no longer matched the current year. */
  updated: number;
}

/**
 * Realigns the denormalised `InventoryItem.alertStatus` column with the
 * current year (ISSUE_033).
 *
 * `alertStatus` is a time-dependent value — it shifts on every 1st of January
 * — but it is only written when an item is created or edited, so without this
 * pass the stored value silently rots and the consumers that read it straight
 * from SQL (analytics, guest shares) keep reporting last year's picture. Run
 * at startup and once a day; only rows whose status actually changed are
 * written, which in practice is a handful per year.
 *
 * `updatedAt` is carried over explicitly so this maintenance pass never looks
 * like a user edit: bumping it would reorder user-facing lists and trigger
 * spurious conflicts in the FEAT-16/23 offline-sync concurrency check.
 */
export async function recomputeAlertStatuses(): Promise<AlertStatusRecomputeResult> {
  const items = await prisma.inventoryItem.findMany({
    where: HAS_MATURITY_WINDOW,
    select: {
      id: true,
      alertStatus: true,
      peakMaturityFrom: true,
      peakMaturityTo: true,
      updatedAt: true,
    },
  });

  let updated = 0;
  for (const item of items) {
    const nextStatus = computeAlertStatus(item.peakMaturityFrom, item.peakMaturityTo);
    if (item.alertStatus === nextStatus) continue;
    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: { alertStatus: nextStatus, updatedAt: item.updatedAt },
    });
    updated += 1;
  }

  return { scanned: items.length, updated };
}

/**
 * Toggles alert pause for a single inventory item.
 */
export async function toggleAlertPause(id: string): Promise<boolean> {
  const item = await prisma.inventoryItem.findFirst({ where: { id, deletedAt: null } });
  if (!item) return false;

  await prisma.inventoryItem.update({
    where: { id },
    data: { alertsPaused: !item.alertsPaused, updatedAt: new Date() },
  });
  return true;
}
