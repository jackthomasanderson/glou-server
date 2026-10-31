import { summarizeStock, unitKind, isIntactItem, type StockSummary, type UnitKind } from '@shared/units';
import type { Product, ProductItem } from './types';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** What a wine's card says about its stock (ux-ui.md §10.2, §10.5, §10.13). */
export interface StockLine {
  kind: UnitKind;
  /** Units in stock everywhere (bottles, or cigars). */
  units: number;
  /** Nothing left in stock: a "Plus en cave" wine (FEAT-101). */
  gone: boolean;
  /** At least one opened bottle or box in stock: the card keeps the "opened" accent. */
  hasOpened: boolean;
  /** The counter on the photo: units in stock, or the fill level of a lone opened bottle; null once gone. */
  badge: string | null;
  /** The badge warns (lone opened bottle nearly empty). */
  badgeLow: boolean;
  /** The visible line, its parts joined by " · "; empty when the badge says it all (a single bottle). */
  parts: string[];
  /** The same stock as a full sentence for screen readers. */
  spoken: string;
  /** {@link itemValue} summed: what the list sorts "by value" on. */
  value: number;
}

export interface StockLineOptions {
  /** Cellars the list is filtered on: the line speaks of them, and recalls the total ("2 ici · 9 en tout"). */
  cellarIds?: readonly string[];
  /** Formats `lastActivityAt` on a "Plus en cave" card. */
  formatDate?: (iso: string) => string;
}

/** A number stays with the word after it ("500 pleines", "60 %"): a line never breaks right after it. */
export const keepNumbersWhole = (text: string) => text.replace(/(\d) /g, '$1\u00a0');

const normalizeSize = (size: string | null) => (size ?? '').trim().toLowerCase();

/**
 * "dont 1 magnum": intact bottles whose size differs from the family's usual
 * one (the size most of its full bottles have). A magnum counts as one bottle.
 */
function otherSizes(items: readonly ProductItem[], t: Translate): string[] {
  const sizes = new Map<string, { label: string; count: number }>();
  for (const item of items) {
    if (!isIntactItem(item) || item.writtenOffAt != null || item.deletedAt != null) continue;
    const key = normalizeSize(item.bottleSize);
    const entry = sizes.get(key) ?? { label: (item.bottleSize ?? '').trim(), count: 0 };
    entry.count += Math.max(item.quantity ?? 1, 0);
    sizes.set(key, entry);
  }
  if (sizes.size < 2) return [];
  const usual = [...sizes.entries()].reduce((best, entry) => (entry[1].count > best[1].count ? entry : best))[0];
  return [...sizes.entries()]
    .filter(([key, { count }]) => key !== usual && count > 0)
    .map(([key, { label, count }]) =>
      key.includes('magnum')
        ? t('familyList.stock.magnum', { count })
        : t('familyList.stock.otherSize', { count, size: label || '—' }));
}

function bottleParts(summary: StockSummary, items: readonly ProductItem[], t: Translate): { parts: string[]; spoken: string[] } {
  const sizes = otherSizes(items, t);
  const withSizes = (text: string) => [text, ...sizes].join(' ');
  const opened = summary.opened;
  if (opened.length === 0) {
    // §10.13: a wine of a single bottle shows neither "×1" nor "1 pleine": the badge says it.
    if (summary.units <= 1) return { parts: [], spoken: [t('familyList.stock.spoken.bottles', { count: summary.units })] };
    const text = withSizes(t('familyList.stock.bottles', { count: summary.units }));
    return { parts: [text], spoken: [text] };
  }
  const parts: string[] = [];
  const spoken: string[] = [];
  if (summary.intactUnits > 0) {
    parts.push(withSizes(t('familyList.stock.full', { count: summary.intactUnits })));
    spoken.push([t('familyList.stock.spoken.full', { count: summary.intactUnits }), ...sizes].join(' '));
  }
  // One opened bottle shows its level; several show their number (levels are in the drawer).
  if (opened.length === 1 && opened[0].fillLevel != null) {
    parts.push(t('familyList.stock.openedLevel', { level: opened[0].fillLevel }));
    spoken.push(t('familyList.stock.spoken.openedLevel', { level: opened[0].fillLevel }));
  } else {
    const text = t('familyList.stock.opened', { count: opened.length });
    parts.push(text);
    spoken.push(text);
  }
  return { parts, spoken };
}

function cigarParts(summary: StockSummary, t: Translate): { parts: string[]; spoken: string[] } {
  if (summary.units <= 1 && summary.opened.length === 0 && summary.closedBoxes === 0) {
    return { parts: [], spoken: [t('familyList.stock.spoken.cigars', { count: summary.units })] };
  }
  const parts: string[] = [];
  if (summary.closedBoxes > 0) parts.push(t('familyList.stock.closedBoxes', { count: summary.closedBoxes }));
  if (summary.opened.length > 0) parts.push(t('familyList.stock.opened', { count: summary.opened.length }));
  if (summary.singleCigars > 0) parts.push(t('familyList.stock.singleCigars', { count: summary.singleCigars }));
  return { parts, spoken: parts };
}

/**
 * The stock line of a wine's card, from its units in stock (`summarizeStock`,
 * the single counting rule). Pure: the card and the list row render it, the
 * filters and the sort read `units`, `hasOpened` and `value`.
 */
export function describeStock(
  product: Pick<Product, 'category' | 'items' | 'lastActivityAt'>,
  t: Translate,
  options: StockLineOptions = {},
): StockLine {
  const kind = unitKind(product.category);
  const total = summarizeStock(product.items, { kind });
  const base = { kind, units: total.units, value: total.value, hasOpened: total.opened.length > 0 };

  if (total.units === 0) {
    const goneText = t(kind === 'cigar' ? 'familyList.stock.goneCigar' : 'familyList.stock.goneBottle');
    const date = product.lastActivityAt && options.formatDate ? options.formatDate(product.lastActivityAt) : '';
    const last = date ? t('familyList.stock.lastActivity', { date }) : null;
    const parts = last ? [goneText, last] : [goneText];
    return { ...base, gone: true, badge: null, badgeLow: false, parts, spoken: parts.join(', ') };
  }

  const loneOpened = kind === 'bottle' && total.units === 1 && total.opened.length === 1 ? total.opened[0] : null;
  const badge = loneOpened && loneOpened.fillLevel != null ? `${loneOpened.fillLevel} %` : String(total.units);
  const badgeLow = loneOpened != null && loneOpened.fillLevel != null && loneOpened.fillLevel <= 20;

  const cellarIds = options.cellarIds ?? [];
  if (cellarIds.length > 0) {
    const hereItems = product.items.filter((item) => item.cellarId != null && cellarIds.includes(item.cellarId));
    const here = summarizeStock(hereItems, { kind });
    if (here.units !== total.units) {
      const parts = [
        t('familyList.stock.here', { count: here.units }),
        t('familyList.stock.total', { count: total.units }),
      ];
      const spoken = t('familyList.stock.spoken.here', { here: here.units, total: total.units });
      return { ...base, gone: false, badge, badgeLow, parts, spoken };
    }
  }

  const { parts, spoken } = kind === 'cigar' ? cigarParts(total, t) : bottleParts(total, product.items, t);
  return { ...base, gone: false, badge, badgeLow, parts, spoken: spoken.join(', ') };
}
