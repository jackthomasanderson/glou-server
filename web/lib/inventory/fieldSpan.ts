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
