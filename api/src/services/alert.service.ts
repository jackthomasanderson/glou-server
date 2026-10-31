import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { CurveShape, readinessPercent } from '../lib/maturity-curve';
import { notificationService } from './notification.service';
import { IN_STOCK_ITEM_FILTER } from '../lib/finished-item';
import { escapeHtml } from '../lib/html';
import { systemConfigService } from './system-config.service';
import { writeProductFields } from '../lib/product-fields';

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
 * #471: the drinking window, its status and the pause are true of every
 * bottle of the wine, so they live on the family (`Product`) and alerts reason
 * per family — a wine of 9 bottles in 3 groups is one alert, one notification.
 *
 * Matches every family not in the trash with at least one end of a drinking
 * window defined — exactly the population for which `computeAlertStatus` can
 * return something other than 'none'. Shared by `getAlerts` (read path) and
 * `recomputeAlertStatuses` (maintenance path) so both always agree on the set
 * of families an alert can possibly apply to. `getAlerts` then keeps only the
 * families with a unit in stock (#573: a finished bottle has been drunk;
 * FEAT-87: a reference has no bottle to drink); the recompute keeps them all
 * so the status shown on their card stays current, and only skips them when
 * notifying.
 */
const HAS_MATURITY_WINDOW = {
  deletedAt: null,
  OR: [{ peakMaturityFrom: { not: null } }, { peakMaturityTo: { not: null } }],
} satisfies Prisma.ProductWhereInput;

/** A family has something to drink: at least one unit in stock. */
const HAS_STOCK = { items: { some: IN_STOCK_ITEM_FILTER } } satisfies Prisma.ProductWhereInput;

/**
 * Returns the families with a unit in stock and a computed alert status,
 * excluding paused alerts and 'none' status — one row per family.
 * Sorted by urgency: past → peak → approaching.
 * Each row also carries a FEAT-86 `readiness` percentage (null when the curve
 * model has nothing to work with).
 *
 * `id` and `cellarId` are those of one unit in stock of the family (the oldest
 * purchase), the one the bell and the drink suggestions open; `productId` is
 * the family's.
 *
 * The status is computed on read and never taken from the denormalised
 * `alertStatus` column: that column only changes when someone edits the wine,
 * so a bottle whose window opens next January would otherwise stay invisible
 * here until it happens to be edited (ISSUE_033). The column is still
 * maintained — see `recomputeAlertStatuses` — for the consumers that aggregate
 * it in SQL, but this user-facing list is always exact.
 */
export async function getAlerts() {
  const families = await prisma.product.findMany({
    where: { ...HAS_MATURITY_WINDOW, ...HAS_STOCK, alertsPaused: false },
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
      collection: true,
      photoUrl: true,
      items: {
        where: IN_STOCK_ITEM_FILTER,
        select: { id: true, cellarId: true },
        orderBy: [{ purchasedAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        take: 1,
      },
    },
  });

  const urgencyOrder: Record<AlertStatus, number> = { past: 0, peak: 1, approaching: 2, none: 3 };
  return families
    .filter((family) => family.items.length > 0)
    .map(({ items: [unit], id: productId, ...family }) => ({
      ...family,
      id: unit.id,
      productId,
      cellarId: unit.cellarId,
      alertStatus: computeAlertStatus(family.peakMaturityFrom, family.peakMaturityTo),
      readiness: computeReadiness(family.curveShape, family.peakMaturityFrom, family.peakMaturityTo),
    }))
    .filter((alert) => alert.alertStatus !== 'none')
    .sort((a, b) => urgencyOrder[a.alertStatus] - urgencyOrder[b.alertStatus]);
}

export interface AlertStatusRecomputeResult {
  /** Families carrying a drinking window, i.e. the rows actually examined. */
  scanned: number;
  /** Families whose stored status no longer matched the current year. */
  updated: number;
}

/**
 * Realigns the denormalised `alertStatus` column with the current year
 * (ISSUE_033).
 *
 * `alertStatus` is a time-dependent value — it shifts on every 1st of January
 * — but it is only written when a wine is created or edited, so without this
 * pass the stored value silently rots and the consumers that read it straight
 * from SQL (analytics, guest shares) keep reporting last year's picture. Run
 * at startup and once a day; only families whose status actually changed are
 * written, which in practice is a handful per year.
 *
 * #471: one pass per family, not per unit — a wine of 9 bottles is written
 * once (with its mirror on the units, whose `updatedAt` the mirror never
 * touches) and notified once. The family's `updatedAt` is carried over
 * explicitly so this maintenance pass never looks like a user edit: bumping it
 * would reorder user-facing lists and trigger spurious conflicts in the
 * FEAT-16/23 offline-sync concurrency check.
 */
export async function recomputeAlertStatuses(): Promise<AlertStatusRecomputeResult> {
  const families = await prisma.product.findMany({
    where: HAS_MATURITY_WINDOW,
    select: {
      id: true,
      name: true,
      producer: true,
      vintage: true,
      alertStatus: true,
      alertsPaused: true,
      peakMaturityFrom: true,
      peakMaturityTo: true,
      updatedAt: true,
      // Is there anything left to drink? (#573, FEAT-87)
      items: { where: IN_STOCK_ITEM_FILTER, select: { id: true }, take: 1 },
    },
  });

  let updated = 0;
  const reachedPeak: PeakItem[] = [];
  for (const family of families) {
    const nextStatus = computeAlertStatus(family.peakMaturityFrom, family.peakMaturityTo);
    if (family.alertStatus === nextStatus) continue;
    await prisma.$transaction((tx) =>
      writeProductFields(tx, family.id, { alertStatus: nextStatus, updatedAt: family.updatedAt }));
    updated += 1;

    // #338: the `family.alertStatus === nextStatus` guard above is the
    // anti-repeat rule — once stored as 'peak', a daily recompute no longer
    // sees a transition and stops notifying, so this fires once per wine
    // until its window is edited or it leaves 'peak' and re-enters later.
    //
    // #573: the column is still kept current for a wine with nothing left in
    // stock (its card shows it), but nobody is told to open a bottle already
    // drunk.
    if (nextStatus === 'peak' && !family.alertsPaused && family.items.length > 0) reachedPeak.push(family);
  }

  // #478: statuses are year-granular, so every wine whose window opens this
  // year flips on 1 January — one message per wine per member was a burst of
  // dozens. Each member now gets one digest for the run.
  if (reachedPeak.length > 0) {
    void notifyPeakReached(reachedPeak).catch((err) => {
      console.error('[alert] Failed to send peak-maturity notification:', err);
    });
  }

  return { scanned: families.length, updated };
}

type PeakItem = { id: string; name: string; producer: string; vintage: number | null };

/** Bottles listed by name in a digest; the rest are summarised as "+ N more". */
const DIGEST_LISTED = 10;

async function alertsUrl(): Promise<string> {
  try {
    return `${await systemConfigService.getEffectivePublicUrl()}/bottles?filter=alerts`;
  } catch {
    return `${process.env.APP_URL ?? ''}/bottles?filter=alerts`;
  }
}

async function notifyPeakReached(items: PeakItem[]): Promise<void> {
  const labelOf = (item: PeakItem) => `${item.name} — ${item.producer}${item.vintage ? ` (${item.vintage})` : ''}`;
  const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, language: true, notifLanguage: true } });
  if (users.length === 0) return;

  if (items.length === 1) {
    const label = labelOf(items[0]);
    const safeLabel = escapeHtml(label);
    await Promise.all(users.map((user) => {
      const isEn = (user.notifLanguage ?? user.language) === 'EN';
      return notificationService.send({
        userId: user.id,
        category: 'peak',
        subject: isEn ? `At peak maturity: ${label}` : `À son apogée : ${label}`,
        htmlBody: isEn
          ? `<p><strong>${safeLabel}</strong> has reached its optimal drinking window. This may be a good time to open it.</p>`
          : `<p><strong>${safeLabel}</strong> est entrée dans sa fenêtre optimale de consommation. C'est peut-être le bon moment pour l'ouvrir.</p>`,
      });
    }));
    return;
  }

  const listed = items.slice(0, DIGEST_LISTED).map((item) => `<li>${escapeHtml(labelOf(item))}</li>`).join('');
  const others = items.length - DIGEST_LISTED;
  const link = escapeHtml(await alertsUrl());
  await Promise.all(users.map((user) => {
    const isEn = (user.notifLanguage ?? user.language) === 'EN';
    const more = others > 0 ? `<p>${isEn ? `+ ${others} more.` : `+ ${others} autre${others > 1 ? 's' : ''}.`}</p>` : '';
    return notificationService.send({
      userId: user.id,
      category: 'peak',
      subject: isEn
        ? `${items.length} bottles reach their drinking window`
        : `${items.length} bouteilles entrent dans leur fenêtre de dégustation`,
      htmlBody: [
        `<p>${isEn ? 'These bottles have reached their optimal drinking window:' : 'Ces bouteilles sont entrées dans leur fenêtre optimale de consommation :'}</p>`,
        `<ul>${listed}</ul>`,
        more,
        `<p><a href="${link}">${isEn ? 'See them in Glou' : 'Les voir dans Glou'}</a></p>`,
      ].join(''),
    });
  }));
}

/**
 * Toggles alert pause for a single inventory item — #471: on its family, so
 * for every bottle of the wine.
 */
export async function toggleAlertPause(id: string): Promise<boolean> {
  const item = await prisma.inventoryItem.findFirst({ where: { id, deletedAt: null }, include: { product: true } });
  if (!item) return false;

  await prisma.$transaction((tx) =>
    writeProductFields(tx, item.productId, { alertsPaused: !item.product.alertsPaused }));
  return true;
}
