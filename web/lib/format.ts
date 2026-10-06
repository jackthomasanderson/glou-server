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

/**
 * Amount in euros with the language's own typography ("12,50 €" in French,
 * "€12.50" in English) instead of a hand-glued " €" (#221). Whole amounts keep
 * no decimals, like before; `fractionDigits` forces a fixed number of them.
 */
export function formatCurrency(n: number, lang: string | undefined, fractionDigits?: number): string {
  return n.toLocaleString(toLocale(lang), {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: fractionDigits ?? 0,
    maximumFractionDigits: fractionDigits ?? 2,
  });
}

/** The currency symbol alone, for input suffixes. */
export function currencySymbol(lang: string | undefined): string {
  return (
    new Intl.NumberFormat(toLocale(lang), { style: 'currency', currency: 'EUR' })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value ?? '€'
  );
}

export function formatNumber(n: number, lang: string | undefined, options?: Intl.NumberFormatOptions): string {
  return n.toLocaleString(toLocale(lang), options);
}
