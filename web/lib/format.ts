/**
 * Locale-aware formatting that follows the language chosen in the app, not the
 * browser's (#217). `lang` is `i18n.language`; anything that is not English
 * falls back to French, the app's default language.
 */
const toLocale = (lang: string | undefined): 'fr-FR' | 'en-GB' =>
  lang?.toLowerCase().startsWith('en') ? 'en-GB' : 'fr-FR';

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(
  value: string | number | Date | null | undefined,
  lang: string | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = toDate(value);
  return date ? date.toLocaleDateString(toLocale(lang), options) : '';
}

export function formatDateTime(
  value: string | number | Date | null | undefined,
  lang: string | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = toDate(value);
  return date ? date.toLocaleString(toLocale(lang), options) : '';
}

export function formatNumber(n: number, lang: string | undefined, options?: Intl.NumberFormatOptions): string {
  return n.toLocaleString(toLocale(lang), options);
}
