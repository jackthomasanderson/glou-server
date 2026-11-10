import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getAlerts, computeReadiness, familyAlertStatus } from './alert.service';
import { CurveShape } from '../lib/maturity-curve';
import { SetGoalInput } from '../schemas/consumption-plan.schema';
import { FINISHED_ITEM_STATE, IN_STOCK_ITEM_FILTER } from '../lib/finished-item';
import { writeProductFields } from '../lib/product-fields';
import { preselectGroup } from '../../../shared/stock-choice';

/**
 * FEAT-08: Plan de Consommation Intelligent & Rotation de Stock.
 *
 * IMPORTANT — mixed access model (see design.md + feature.md decision):
 * - `getSuggestions` operates on the FULL SHARED inventory, exactly like
 *   alert.service.ts's getAlerts() — no userId filter. The list of "what to
 *   drink" is instance-wide data, not personal to the caller.
 * - `getCurrentGoal` / `setGoal` / `getGoalProgress` ARE scoped to the
 *   calling userId. ConsumptionGoal is a deliberately personal resolution
 *   (like theme/notifCategories on User), not an inventory entity, so
 *   filtering it by userId does NOT violate the "userId = audit only"
 *   invariant — that invariant applies to inventory data, not to this model.
 */

const DEFAULT_SUGGESTIONS_LIMIT = 7;
const DEFAULT_POSTPONE_DAYS = 7;

export type SuggestionReason = 'peak_window' | 'opened' | 'rotation';

export interface ConsumptionSuggestion {
  /** A unit in stock of the wine, the one the suggestion opens. */
  id: string;
  /** #471: the wine (family) — one suggestion per wine. */
  productId: string;
  name: string;
  producer: string;
  category: string;
  vintage: number | null;
  photoUrl: string | null;
  cellarId: string | null;
  collection: string | null;
  alertStatus: string | null;
  /** #471 (FEAT-105 c3): an opened bottle (box) of the wine, suggested first: "Finir l'entamée (60 %)". */
  isOpened: boolean;
  fillLevel: number | null;
  /** Cigars left in an opened box. */
  cigarsLeft: number | null;
  reason: SuggestionReason;
}

// #471: the description, the drinking window and the postponement are true
// of every bottle of the wine, so they are read on the family.
const SUGGESTION_SELECT = {
  id: true,
  productId: true,
  cellarId: true,
  isOpened: true,
  fillLevel: true,
  cigarsLeft: true,
  createdAt: true,
  product: {
    select: {
      name: true,
      producer: true,
      category: true,
      vintage: true,
      photoUrl: true,
      collection: true,
      peakMaturityFrom: true,
      peakMaturityTo: true,
      curveShape: true,
      consumptionPostponedUntil: true,
    },
  },
} satisfies Prisma.InventoryItemSelect;

type SourceItem = Prisma.InventoryItemGetPayload<{ select: typeof SUGGESTION_SELECT }>;

// Lower weight = surfaced first. 'past'/'peak'/'approaching' follow the
// shared ALERT_URGENCY_ORDER (shared/inventory.ts, #644); 'opened' bottles are prioritized above
// 'approaching' (finish what's started) but below anything already at/past
// its peak; 'rotation' fillers come last (see getSuggestions step 3).
const REASON_WEIGHT: Record<string, number> = {
  past: 0,
  peak: 1,
  opened: 3,
  approaching: 4,
  rotation: 5,
};

function isPostponed(item: SourceItem, now: Date): boolean {
  const until = item.product.consumptionPostponedUntil;
  return !!until && until > now;
}

function toSuggestion(item: SourceItem, reason: SuggestionReason): ConsumptionSuggestion {
  const { product } = item;
  return {
    id: item.id,
    productId: item.productId,
    name: product.name,
    producer: product.producer,
    category: product.category,
    vintage: product.vintage,
    photoUrl: product.photoUrl,
    cellarId: item.cellarId,
    collection: product.collection,
    // Computed on read, never read back from the denormalised column: that
    // column is only refreshed on edit and on the daily maintenance pass, so
    // it can lag behind the current year (ISSUE_033).
    alertStatus: familyAlertStatus(product),
    isOpened: item.isOpened,
    fillLevel: item.fillLevel,
    cigarsLeft: item.cigarsLeft,
    reason,
  };
}

/** What `preselectGroup` reads of a line. */
const GROUP_SELECT = {
  id: true,
  productId: true,
  cellarId: true,
  purchasePrice: true,
  purchasedAt: true,
  quantity: true,
  isOpened: true,
  fillLevel: true,
  cigarsPerBox: true,
  cigarsLeft: true,
  writtenOffAt: true,
  deletedAt: true,
} satisfies Prisma.InventoryItemSelect;

/**
 * #471 (FEAT-104, ux-ui.md §10.4.2): the line a full wine is suggested from
 * is the one "J'en ouvre une" would preselect — bought first, then the
 * cheapest, then the largest — so the tasting form opened from the plan
 * starts on it ("Quelles bouteilles ?" there lets the member pick another).
 * One query for the few wines suggested; an opened bottle is left as it is.
 */
async function onPreselectedLines(suggestions: ConsumptionSuggestion[]): Promise<ConsumptionSuggestion[]> {
  const families = [...new Set(suggestions.filter((s) => !s.isOpened).map((s) => s.productId))];
  if (families.length === 0) return suggestions;
  const rows = await prisma.inventoryItem.findMany({
    where: { ...IN_STOCK_ITEM_FILTER, isOpened: false, productId: { in: families } },
    select: GROUP_SELECT,
  });
  const byFamily = new Map<string, typeof rows>();
  for (const row of rows) byFamily.set(row.productId, [...(byFamily.get(row.productId) ?? []), row]);
  return suggestions.map((suggestion) => {
    if (suggestion.isOpened) return suggestion;
    const lines = (byFamily.get(suggestion.productId) ?? []).map((row) => ({
      ...row,
      purchasePrice: row.purchasePrice == null ? null : Number(row.purchasePrice),
    }));
    const chosen = preselectGroup(lines)?.line;
    return chosen ? { ...suggestion, id: chosen.id, cellarId: chosen.cellarId } : suggestion;
  });
}

/**
 * Priority-ordered "drink now / soon" list combining:
 * 1) peak-window wines (reuses the existing, non-userId-filtered getAlerts())
 * 2) opened bottles of wines not already surfaced via (1) — "finish what's started"
 * 3) rotation fillers (oldest untouched stock) if slots remain up to `limit`
 *
 * #471 (FEAT-96 c4): one line per wine (family), whatever its number of
 * bottles and groups. FEAT-105 c3: a wine with an opened bottle (box) is
 * suggested through it — finish it first — whatever its reason; a full one
 * through the line "J'en ouvre une" would preselect (FEAT-104). Wines whose `consumptionPostponedUntil` is still in the
 * future are excluded from all three sources. No userId filter anywhere — the
 * shared inventory is visible to every member (design.md invariant).
 */
export async function getSuggestions(limit = DEFAULT_SUGGESTIONS_LIMIT): Promise<ConsumptionSuggestion[]> {
  const now = new Date();

  // 1) Peak-window candidates, one per family, each with a unit in stock.
  // alert.service.ts's select doesn't carry consumptionPostponedUntil/isOpened/
  // fillLevel, so we fetch those extra fields in a follow-up query rather than
  // touching the existing, tested getAlerts() implementation.
  const alerts = await getAlerts();
  const alertIds = alerts.map((a) => a.id);

  // Excluding by family is done in memory rather than with a `notIn` clause:
  // that list grows with the collection (every peak-window wine), while the
  // opened-items candidate set here, and the final result below, stay small
  // (#162).
  const listedFamilies = new Set(alerts.map((a) => a.productId));

  const [alertExtra, openedItemsRaw] = await Promise.all([
    alertIds.length > 0
      ? prisma.inventoryItem.findMany({ where: { id: { in: alertIds } }, select: SUGGESTION_SELECT })
      : Promise.resolve([] as SourceItem[]),
    prisma.inventoryItem.findMany({
      // FEAT-87: references are never suggested for drinking. #573: neither
      // is a finished bottle — "opened" means there is still some left.
      where: { ...IN_STOCK_ITEM_FILTER, isOpened: true },
      select: SUGGESTION_SELECT,
      // The opened bottle kept for a wine is the first opened, the same on every call.
      orderBy: [{ openedAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }],
    }),
  ]);
  // The first opened bottle of each wine: the one to finish first (FEAT-105 c3).
  const firstOpened = new Map<string, SourceItem>();
  for (const item of openedItemsRaw) {
    if (!firstOpened.has(item.productId)) firstOpened.set(item.productId, item);
  }
  // One opened bottle per wine, and none of a wine already listed.
  const openedItems: SourceItem[] = [];
  for (const item of firstOpened.values()) {
    if (listedFamilies.has(item.productId)) continue;
    listedFamilies.add(item.productId);
    openedItems.push(item);
  }

  const alertExtraMap = new Map(alertExtra.map((item) => [item.id, item]));

  // FEAT-86: `readiness` (0-100, or -1 when the curve model has nothing to
  // say) is a secondary sort key WITHIN each coarse urgency bucket — a
  // twin-peak wine sitting in its mid-window trough is not surfaced ahead of
  // one that is genuinely at its best, without ever letting a merely-riper
  // 'approaching' bottle jump the 'past'/'peak' queue.
  const weighted: Array<{ suggestion: ConsumptionSuggestion; weight: number; readiness: number }> = [];

  for (const alert of alerts) {
    const extra = alertExtraMap.get(alert.id);
    if (!extra || isPostponed(extra, now)) continue;
    weighted.push({
      // At its peak and already opened: the opened bottle, to finish first.
      suggestion: toSuggestion(firstOpened.get(extra.productId) ?? extra, 'peak_window'),
      weight: REASON_WEIGHT[alert.alertStatus] ?? REASON_WEIGHT.approaching,
      readiness: alert.readiness ?? -1,
    });
  }

  for (const opened of openedItems) {
    if (isPostponed(opened, now)) continue;
    weighted.push({
      suggestion: toSuggestion(opened, 'opened'),
      weight: REASON_WEIGHT.opened,
      readiness:
        computeReadiness(
          opened.product.curveShape as CurveShape | null,
          opened.product.peakMaturityFrom,
          opened.product.peakMaturityTo,
        ) ?? -1,
    });
  }

  weighted.sort((a, b) => a.weight - b.weight || b.readiness - a.readiness);
  let result = weighted.slice(0, limit).map((w) => w.suggestion);

  // 3) Rotation fillers (the literal "Rotation de Stock" from the feature
  // name): once alert- and opened-based suggestions are exhausted, surface
  // the oldest untouched stock so nothing sits forgotten indefinitely.
  if (result.length < limit) {
    const needed = limit - result.length;
    // Over-fetch by the exclusion set's size rather than embedding it as a
    // `notIn` id list (#162): the WHERE clause stays cheap regardless of how
    // many wines are already surfaced elsewhere, and the slightly larger
    // LIMIT only matters when the final list is truncated to `needed` anyway.
    const rotationCandidates = await prisma.inventoryItem.findMany({
      where: {
        ...IN_STOCK_ITEM_FILTER,
        isOpened: false,
        product: { OR: [{ consumptionPostponedUntil: null }, { consumptionPostponedUntil: { lte: now } }] },
      },
      select: SUGGESTION_SELECT,
      orderBy: { createdAt: 'asc' },
      // One unit per wine: its oldest one.
      distinct: ['productId'],
      take: needed + listedFamilies.size,
    });
    const rotationItems = rotationCandidates.filter((item) => !listedFamilies.has(item.productId)).slice(0, needed);
    result = result.concat(rotationItems.map((item) => toSuggestion(item, 'rotation')));
  }

  return onPreselectedLines(result);
}

/**
 * "Sauter" a suggestion: excludes the item from getSuggestions() until
 * `days` from now. Same suppression pattern as alert.service.ts's
 * alertsPaused, but self-expiring rather than a manual toggle.
 */
export async function postponeItem(id: string, days = DEFAULT_POSTPONE_DAYS): Promise<boolean> {
  const item = await prisma.inventoryItem.findFirst({ where: { id, deletedAt: null } });
  if (!item) return false;

  // #471: the suggestion is about the wine, so the family is postponed.
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await prisma.$transaction((tx) => writeProductFields(tx, item.productId, { consumptionPostponedUntil: until }));
  return true;
}

// ─── Consumption goals (personal — see file-level note) ──────────────────────

export interface ConsumptionGoalDTO {
  id: string;
  periodStart: Date;
  periodEnd: Date;
  targetType: string;
  targetValue: number;
  createdAt: Date;
}

/** The goal (if any) whose period currently covers "now", for this user. */
export async function getCurrentGoal(userId: string): Promise<ConsumptionGoalDTO | null> {
  const now = new Date();
  return prisma.consumptionGoal.findFirst({
    where: { userId, periodStart: { lte: now }, periodEnd: { gte: now } },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Records a new goal. There is no update path on ConsumptionGoal by design
 * (createdAt-only, no updatedAt column — see feature.md) — redefining a
 * goal for the same period simply inserts a newer row, and getCurrentGoal
 * always resolves the most recently created one covering "now". This keeps
 * a lightweight history for free without extra bookkeeping.
 */
export async function setGoal(userId: string, input: SetGoalInput): Promise<ConsumptionGoalDTO> {
  return prisma.consumptionGoal.create({
    data: {
      userId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      targetType: input.targetType,
      targetValue: input.targetValue,
    },
  });
}

export interface GoalProgress {
  goal: ConsumptionGoalDTO | null;
  consumedCount: number;
  percent: number;
  remaining: number;
}

/**
 * Progress toward the user's current goal.
 *
 * "Consumed" criterion, derived from the existing FEAT-77 stock-update flow
 * (TastingForm's stockUpdate.consumed choice — see
 * web/components/tastings/TastingForm.tsx handleStockChoice): that flow
 * PATCHes InventoryItem with { isOpened: true, fillLevel: 0 } and nothing
 * else — TastingNote does NOT persist a stockUpdate field, so InventoryItem
 * itself is the only durable signal of "this bottle was finished". Every
 * write through inventoryService.updateItem stamps `updatedBy`/`updatedAt`
 * with the acting user (see api/src/services/inventory.service.ts), so we
 * count items with isOpened=true, fillLevel=0, updatedBy=this user, and
 * updatedAt inside the goal's period.
 *
 * This progress count IS legitimately scoped by userId — unlike the shared
 * suggestion list above, a ConsumptionGoal is a personal target, so "did I
 * hit my personal goal" is naturally personal too (see file-level note).
 *
 * KNOWN LIMITATION (documented, not silently papered over): targetType
 * 'volume' and 'count' are both counted as an integer number of bottles for
 * v1. InventoryItem has no reliable structured volume field across all
 * categories (bottleSize is free text like "75cl"/"magnum", absent for
 * spirits/cigars), so a true liter-based volume isn't safely derivable
 * without a fragile parser. TODO(FEAT-08): revisit if a structured volume
 * field is ever added to the inventory model.
 */
export async function getGoalProgress(userId: string): Promise<GoalProgress> {
  const goal = await getCurrentGoal(userId);
  if (!goal) {
    return { goal: null, consumedCount: 0, percent: 0, remaining: 0 };
  }

  // #471: a finished unit is one copy (a sub-record detached from its group,
  // or a group of one), so counting its rows counts bottles.
  const consumedCount = await prisma.inventoryItem.count({
    where: {
      deletedAt: null,
      ...FINISHED_ITEM_STATE,
      updatedBy: userId,
      updatedAt: { gte: goal.periodStart, lte: goal.periodEnd },
    },
  });

  const percent = goal.targetValue > 0 ? Math.min(100, Math.round((consumedCount / goal.targetValue) * 100)) : 0;
  const remaining = Math.max(0, goal.targetValue - consumedCount);

  return { goal, consumedCount, percent, remaining };
}
