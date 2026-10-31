import { isFinishedState, isIntactItem, itemUnits, type UnitKind } from '@shared/units';
import type { ProductItem } from './types';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** §10.3: lines shown before "Voir les N autres". */
export const VISIBLE_LINES = 5;

/** What the drawer of a wine lists (ux-ui.md §10.3, blocks 2 and 3). */
export interface FamilyLines {
  /** Groups sorted by cellar then purchase day, then the opened bottles or boxes. */
  inCellar: ProductItem[];
  /** Drunk, smoked or gone (broken, given away, lost): most recent first. */
  gone: ProductItem[];
  /** Several lines in the cellar: each one shows its purchase month (§10.3). */
  showPurchaseMonth: boolean;
  /** Copies drunk or smoked, and copies written off ("3 bues · 1 cassée, offerte ou perdue"). */
  finished: number;
  writtenOff: number;
}

export interface LineContext {
  kind: UnitKind;
  t: Translate;
  cellarName: (id: string) => string | undefined;
  formatPrice: (value: number) => string;
  /** A `YYYY-MM-DD` day as "janv. 2026" (never through a local Date, D6). */
  formatMonth: (day: string) => string;
  formatDate: (iso: string) => string;
}

const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });
/** Empty last: a line without a cellar or a purchase day comes after the others. */
const emptyLast = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : byText(a, b);

const isWrittenOff = (item: ProductItem) => item.writtenOffAt != null;
const isGone = (item: ProductItem) => isWrittenOff(item) || isFinishedState(item);
/** When a gone copy left: its write-off, else its last change (no dedicated column, A1). */
const goneAt = (item: ProductItem) => (item.writtenOffAt ?? item.updatedAt) as string;

/**
 * Splits a wine's copies (GET /api/products/:id, every one out of the trash)
 * into the lines of its drawer. Pure: the drawer renders it, the tests read it.
 */
export function familyLines(items: readonly ProductItem[], cellarName: (id: string) => string | undefined): FamilyLines {
  const present = items.filter((item) => item.deletedAt == null);
  const nameOf = (item: ProductItem) => (item.cellarId ? cellarName(item.cellarId) ?? '' : null);
  const groups = present
    .filter((item) => !isGone(item) && isIntactItem(item) && itemUnits(item) > 0)
    .sort((a, b) =>
      emptyLast(nameOf(a), nameOf(b))
      || emptyLast(a.purchasedAt, b.purchasedAt)
      || byText(a.createdAt as string, b.createdAt as string));
  const opened = present
    .filter((item) => !isGone(item) && !isIntactItem(item) && itemUnits(item) > 0)
    .sort((a, b) => emptyLast(a.openedAt as string | null, b.openedAt as string | null));
  const gone = present.filter(isGone).sort((a, b) => byText(goneAt(b), goneAt(a)));
  return {
    inCellar: [...groups, ...opened],
    gone,
    showPurchaseMonth: groups.length + opened.length > 1,
    finished: gone.filter((item) => !isWrittenOff(item)).length,
    writtenOff: gone.filter(isWrittenOff).reduce((sum, item) => sum + Math.max(item.quantity ?? 1, 0), 0),
  };
}

/** "20 € / bouteille", "45 € / boîte", "12 € / cigare": the price of ONE copy (decision #471, point 7). */
function priceOf(item: ProductItem, ctx: LineContext): string | null {
  if (item.purchasePrice == null) return null;
  const per = ctx.kind === 'bottle' ? 'perBottle' : item.cigarsPerBox != null ? 'perBox' : 'perCigar';
  return ctx.t(`familyDrawer.lines.${per}`, { price: ctx.formatPrice(item.purchasePrice) });
}

/** Which bottle a tasting was of: "Garage · 20 € / bouteille". */
export const bottleLabel = (item: ProductItem, ctx: LineContext) => whereAndWhat(item, ctx, false).join(' · ');

/** Where the copy is: its cellar, and the free-text place within it ("Étagère du haut"). */
function where(item: ProductItem, ctx: LineContext): string[] {
  const cellar = (item.cellarId ? ctx.cellarName(item.cellarId) : undefined) ?? ctx.t('familyDrawer.lines.noCellar');
  const location = item.location?.trim();
  return location ? [cellar, location] : [cellar];
}

/** Where the copy is, its price, its size if not standard, its purchase month on a multi-line wine. */
function whereAndWhat(item: ProductItem, ctx: LineContext, showPurchaseMonth: boolean): string[] {
  const size = ctx.kind === 'bottle' ? item.bottleSize?.trim() : '';
  return [
    ...where(item, ctx),
    priceOf(item, ctx),
    size || null,
    showPurchaseMonth && item.purchasedAt ? ctx.formatMonth(item.purchasedAt) : null,
  ].filter((part): part is string => Boolean(part));
}

/**
 * The parts of one line in the cellar, joined by " · " on screen:
 * "×4 · Garage · 20 € / bouteille · janv. 2026", "Entamée · Garage · ouverte le 3 oct.",
 * "3 boîtes fermées de 25 · Humidor", "Boîte entamée · 10 restants", "4 cigares à l'unité".
 */
export function lineParts(item: ProductItem, ctx: LineContext, showPurchaseMonth: boolean): string[] {
  const { t } = ctx;
  if (!isIntactItem(item)) {
    // An opened one: where it is and since when; its level is drawn beside.
    const opened = item.openedAt ? t('familyDrawer.lines.openedOn', { date: ctx.formatDate(item.openedAt as string) }) : null;
    const head = ctx.kind === 'cigar'
      ? [t('familyDrawer.lines.openedBox'), t('familyDrawer.lines.cigarsLeft', { count: item.cigarsLeft ?? 0 })]
      : [t('familyDrawer.lines.opened')];
    return [...head, ...where(item, ctx), ...(opened ? [opened] : [])];
  }
  const place = whereAndWhat(item, ctx, showPurchaseMonth);
  const count = Math.max(item.quantity ?? 1, 0);
  if (ctx.kind === 'cigar') {
    const head = item.cigarsPerBox != null
      ? t('familyDrawer.lines.closedBoxes', { count, size: item.cigarsPerBox })
      : t('familyDrawer.lines.singleCigars', { count });
    return [head, ...place];
  }
  return [t('familyDrawer.lines.count', { number: count }), ...place];
}

/** One gone copy: what happened and when, its cellar of origin and its price (still in the spending). */
export function goneParts(item: ProductItem, ctx: LineContext): string[] {
  const date = ctx.formatDate(goneAt(item));
  const what = isWrittenOff(item)
    ? ctx.t('familyDrawer.gone.writtenOffOn', { count: Math.max(item.quantity ?? 1, 0), date })
    : ctx.kind === 'cigar'
      ? ctx.t(item.cigarsPerBox != null ? 'familyDrawer.gone.boxFinishedOn' : 'familyDrawer.gone.smokedOn', { date })
      : ctx.t('familyDrawer.gone.drunkOn', { date });
  return [what, ...whereAndWhat(item, ctx, false)];
}

/** The folded summary: "3 bues · 1 cassée, offerte ou perdue" (cigars: "fumés"). */
export function goneSummary(lines: Pick<FamilyLines, 'finished' | 'writtenOff'>, kind: UnitKind, t: Translate): string {
  return [
    lines.finished > 0 ? t(kind === 'cigar' ? 'familyDrawer.gone.smoked' : 'familyDrawer.gone.drunk', { count: lines.finished }) : null,
    lines.writtenOff > 0 ? t('familyDrawer.gone.writtenOff', { count: lines.writtenOff }) : null,
  ].filter(Boolean).join(' · ');
}
