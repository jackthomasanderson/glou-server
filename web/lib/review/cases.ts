import { isFinishedState, unitKind, type UnitKind } from '@shared/units';
import type { ReviewField } from '@shared/review';
import { formatHistoryValue, type HistoryValueContext } from '@/lib/inventory/history-format';
import { unitNoun, type UnitNoun } from '@/lib/products/stockActions';
import type { ReviewCases, ReviewCount, ReviewMerge } from './client';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** The banner's "N points à vérifier": each case to merge or keep apart, each number to check. */
export const reviewPointCount = (list: ReviewCases | undefined): number =>
  list ? list.merges.length + list.counts.length : 0;

/** A case is named by its families' ids: stable while they are proposed together. */
export const mergeCaseId = (merge: ReviewMerge): string => merge.products.map((product) => product.id).join('|');

/** Bottles or cigars: what the families of a case hold (one wine, one category). */
export const mergeKind = (merge: ReviewMerge): UnitKind => unitKind(merge.products[0]?.category ?? 'wine');

/** Point 40: every disagreeing field pre-checked on the family the API pre-selected (the most recent holding a value). */
export function preselectedChoices(merge: ReviewMerge): Partial<Record<ReviewField, string>> {
  return Object.fromEntries(merge.disagreements.map((d) => [d.field, d.preselectedProductId]));
}

/** Enumerated values shown by their label, as the description form shows them. */
const ENUM_LABELS: Partial<Record<ReviewField, string>> = {
  color: 'inventory.color',
  sparklingType: 'inventory.sparklingTypes',
  sugarLevel: 'inventory.sugarLevels',
  spiritType: 'inventory.spiritTypes',
};

/** A compared value as the member reads it ("Graves", "Rouge", "Oui", "13,5"). */
export function reviewValueLabel(field: ReviewField, value: unknown, t: Translate, ctx: HistoryValueContext = {}): string {
  const labels = ENUM_LABELS[field];
  if (labels && typeof value === 'string') return t(`${labels}.${value}`, { defaultValue: value });
  return formatHistoryValue(field, value, t, ctx);
}

/** How the transformation split an old record (ux-ui.md §10.7, decision #471 point 55). */
export interface CountSplit {
  noun: UnitNoun;
  /** Copies the old record counted: the guessed group and what was split off it. */
  before: number;
  /** The copies split off it: one opened (or finished) bottle or box, as a rule. */
  split: number;
  /** The old record was opened, or already finished (drunk, smoked). */
  state: 'opened' | 'finished';
  /** Full copies the group was given (N − 1). */
  full: number;
}

/** Null when the split-off copy is no longer there (trashed meanwhile): only the group is said. */
export function countSplit(count: ReviewCount): CountSplit | null {
  const { group, subRecords, product } = count;
  if (subRecords.length === 0) return null;
  const full = Math.max(group.quantity ?? 1, 0);
  return {
    noun: unitNoun(group, unitKind(product.category)),
    before: full + subRecords.length,
    split: subRecords.length,
    state: subRecords.every((record) => isFinishedState(record)) ? 'finished' : 'opened',
    full,
  };
}

/** « Avant la mise à jour : 6 bouteilles, entamée. Glou a compté 1 entamée + 5 pleines. » */
export function describeCountSplit(split: CountSplit, t: Translate): string {
  const context = `${split.state}_${split.noun}`;
  return [
    t(`review.counts.before_${split.noun}`, { count: split.before, state: t(`review.counts.state_${context}`) }),
    t(`review.counts.counted_${split.noun}`, {
      count: split.full,
      split: t(`review.counts.split_${context}`, { count: split.split }),
    }),
  ].join(' ');
}
