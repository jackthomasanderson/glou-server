/**
 * #867, recette n°5 ter of #847: the add/edit form lays its short fields two
 * per row on a phone and four per row on a computer — about 160 px each in
 * both cases, the dialog being narrow. A label longer than this wraps onto two
 * lines there, and runs over the value or above the field's frame: such a
 * field takes two columns instead. Counted in characters, whatever the
 * language; checked in Chromium at 375, 1280 and 1471 px in French and English.
 */
export const HALF_FIELD_LABEL_MAX = 16;

/** The grid span of a half-width field of the form: two columns when its label is long. */
export const halfFieldSpan = (label: string): string | undefined =>
  label.trim().length > HALF_FIELD_LABEL_MAX ? 'col-span-2' : undefined;
