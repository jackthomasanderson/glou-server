/**
 * Locale-aware formatting that follows the language chosen in the app, not the
 * browser's (#217). `lang` is `i18n.language`; anything that is not English
 * falls back to French, the app's default language.
 */

/** Compose a session/trusted-device label from the API's structured device info (#95). */
export function formatDeviceLabel(
  device: { browser: string | null; os: string | null },
  t: (key: string, options?: Record<string, string>) => string,
): string {
  if (!device.browser && !device.os) return t('profile.sessions.unknownDevice');
  return t('profile.sessions.deviceLabel', {
    browser: device.browser ?? t('profile.sessions.unknownBrowser'),
    os: device.os ?? t('profile.sessions.unknownOs'),
  });
}
/**
 * The member's profile preferences (#405), set once by ThemeWrapper when the
 * user loads. Module state rather than a parameter so the ~10 existing
 * formatDateTime call sites pick the time format up without being rewired.
 */
export interface FormatPreferences {
  tempUnit: 'CELSIUS' | 'FAHRENHEIT';
  dateFormat: 'SYSTEM' | 'H24' | 'H12';
}
let preferences: FormatPreferences = { tempUnit: 'CELSIUS', dateFormat: 'SYSTEM' };

export function setFormatPreferences(next: Partial<FormatPreferences>): void {
  preferences = { ...preferences, ...next };
}

const toFahrenheit = (celsius: number) => Math.round((celsius * 9) / 5 + 32);
/** A Celsius value with the language's decimal separator ("17,5" in French, #700). */
const celsiusNumber = (celsius: number, lang: string | undefined) => formatNumber(celsius, lang, { maximumFractionDigits: 1 });

/** A Celsius reading in the member's chosen unit, e.g. "17,5°C" or "64°F". */
export function formatTemperature(celsius: number, lang: string | undefined): string {
  if (preferences.tempUnit === 'FAHRENHEIT') return `${formatNumber(toFahrenheit(celsius), lang)}°F`;
  return `${celsiusNumber(celsius, lang)}°C`;
}

/** A min–max range in the member's chosen unit, e.g. "16–18°C". */
export function formatTemperatureRange(minCelsius: number, maxCelsius: number, lang: string | undefined): string {
  if (preferences.tempUnit === 'FAHRENHEIT') {
    return `${formatNumber(toFahrenheit(minCelsius), lang)}–${formatNumber(toFahrenheit(maxCelsius), lang)}°F`;
  }
  return `${celsiusNumber(minCelsius, lang)}–${celsiusNumber(maxCelsius, lang)}°C`;
}

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
  if (!date) return '';
  const hourCycle: Intl.DateTimeFormatOptions =
    preferences.dateFormat === 'H12' ? { hour12: true } : preferences.dateFormat === 'H24' ? { hour12: false } : {};
  return date.toLocaleString(toLocale(lang), { ...hourCycle, ...options });
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

/** The decimal separator of the interface language: "," in French. */
export function decimalSeparator(lang: string | undefined): string {
  return new Intl.NumberFormat(toLocale(lang)).formatToParts(1.5).find((p) => p.type === 'decimal')?.value ?? '.';
}

export function formatNumber(n: number, lang: string | undefined, options?: Intl.NumberFormatOptions): string {
  return n.toLocaleString(toLocale(lang), options);
}

/**
 * Today's date as `YYYY-MM-DD` in the user's local time zone (#482).
 * `toISOString()` gives the UTC date, which is still "yesterday" for a
 * tasting logged at 0:30 am in France.
 */
export function todayLocalIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * #834: today's date as `YYYY-MM-DD` in `timeZone` — the instance's, where
 * the API dates a purchase it is sent without a day. The browser's day
 * ({@link todayLocalIso}) when the zone is unknown.
 */
export function todayInTimeZone(timeZone: string | undefined, now: Date = new Date()): string {
  if (!timeZone) return todayLocalIso(now);
  try {
    // en-CA writes a date as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return todayLocalIso(now); // RangeError: a zone this browser does not know
  }
}

/**
 * The last millisecond of a `YYYY-MM-DD` day in the user's local time zone (#598).
 * `new Date('2026-10-25')` is midnight UTC, the very start of the day (2 a.m. in France).
 */
export function endOfLocalDay(dateIso: string): Date {
  const [y, m, d] = dateIso.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}
