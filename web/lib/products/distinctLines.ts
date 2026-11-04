import { lineParts, type LineContext } from './lines';
import type { ProductItem } from './types';

/** A `YYYY-MM-DD` day read at noon UTC, so no time zone moves it to the day before or after. */
const dayInstant = (value: string) => `${value.slice(0, 10)}T12:00:00.000Z`;

/** The day a line was bought, then the day it was added — whichever tells apart the lines it is compared with. */
const distinctions: readonly ((item: ProductItem) => string | null)[] = [
  (item) => (item.purchasedAt ? item.purchasedAt.slice(0, 10) : null),
  (item) => (item.createdAt ? String(item.createdAt).slice(0, 10) : null),
];

/**
 * The label of each line of "Quelles bouteilles ?" (ux-ui.md §10.4.2), told
 * apart when two read the same (recette #471: two « ×1 · Cave · 75 cl »,
 * prices and purchase days hidden from a guest): the purchase day, else the
 * day the line was added, else its rank — only on the lines that collide.
 */
export function distinctLineLabels(groups: readonly ProductItem[], ctx: LineContext): Map<string, string> {
  const base = new Map(groups.map((group) => [group.id, lineParts(group, ctx, true).join(' · ')]));
  const byLabel = new Map<string, ProductItem[]>();
  for (const group of groups) {
    const label = base.get(group.id) as string;
    byLabel.set(label, [...(byLabel.get(label) ?? []), group]);
  }
  const labels = new Map(base);
  for (const [label, same] of byLabel) {
    if (same.length < 2) continue;
    const told = distinctions.findIndex((of) => new Set(same.map(of)).size === same.length);
    same.forEach((group, index) => {
      const day = told >= 0 ? distinctions[told](group) : null;
      const extra = day
        ? ctx.t(told === 0 ? 'openDrink.which.boughtOn' : 'openDrink.which.addedOn', { date: ctx.formatDate(dayInstant(day)) })
        : ctx.t('openDrink.which.lineNumber', { number: index + 1 });
      labels.set(group.id, `${label} · ${extra}`);
    });
  }
  return labels;
}
