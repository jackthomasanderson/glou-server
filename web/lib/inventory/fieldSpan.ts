/**
 * #867, recette n°5 ter of #847: the add/edit form lays its short fields two
 * per row on a phone and four per row on a computer — about 160 px each in
 * both cases, the dialog being narrow. A label longer than this wraps onto two
 * lines there, and runs over the value or above the field's frame: such a
 * field takes two columns instead. Counted in characters, whatever the
 * language; checked in Chromium at 375, 1280 and 1471 px in French and English.
 */
export const HALF_FIELD_LABEL_MAX = 16;

const isLong = (label: string) => label.trim().length > HALF_FIELD_LABEL_MAX;

/**
 * The grid span of a half-width field of the form: two columns when its label
 * is long. Fields that share a phone row are decided together (review of
 * #874): when one of them is long both take two columns, so the short one is
 * not left alone beside an empty cell.
 */
export const halfFieldSpan = (label: string, partnerLabel?: string): string | undefined =>
  isLong(label) || (partnerLabel !== undefined && isLong(partnerLabel)) ? 'col-span-2' : undefined;

/** Columns a half-width field takes on a phone, as {@link halfFieldSpan} decides. */
export const halfFieldColumns = (label: string, partnerLabel?: string): 1 | 2 =>
  halfFieldSpan(label, partnerLabel) ? 2 : 1;

// Literal names, for Tailwind to generate them.
const DESKTOP_SPAN = { 1: 'sm:col-span-1', 2: 'sm:col-span-2', 3: 'sm:col-span-3', 4: 'sm:col-span-4' } as const;

/**
 * Recette n°5 quater of #847 (KO 5.1): on a computer the form's grids have
 * four columns, and the last field of a grid ("Rappel de consommation" of a
 * cigar) could sit alone on its row, an empty half beside it. Given the
 * columns the fields before it take, in order from the start of a full row,
 * the last field takes what is left of its row — the whole row when it
 * starts one. Laid out like the CSS grid: in order, no dense packing.
 */
export function lastFieldDesktopSpan(spansBefore: readonly number[], own: number, columns = 4): string {
  let used = 0;
  for (const span of spansBefore) {
    if (used + span > columns) used = 0;
    used = (used + span) % columns;
  }
  const fill = used > 0 && used + own <= columns ? columns - used : columns;
  return DESKTOP_SPAN[fill as keyof typeof DESKTOP_SPAN];
}
