import { describe, it, expect, afterEach } from 'vitest';
import {
  currencySymbol, formatCurrency, formatDate, formatDateTime, formatNumber,
  formatTemperature, formatTemperatureRange, setFormatPreferences, todayInTimeZone, todayLocalIso,
} from '../format';

describe('format (#217)', () => {
  it('formats dates in the app language, not the browser one', () => {
    expect(formatDate('2026-09-03T12:00:00Z', 'fr')).toBe('03/09/2026');
    expect(formatDate('2026-09-03T12:00:00Z', 'en')).toBe('03/09/2026');
    expect(formatDate('2026-09-03T12:00:00Z', 'en', { month: 'long', day: 'numeric', year: 'numeric' })).toBe('3 September 2026');
    expect(formatDate('2026-09-03T12:00:00Z', 'fr', { month: 'long', day: 'numeric', year: 'numeric' })).toBe('3 septembre 2026');
  });

  it('accepts region variants and falls back to French', () => {
    expect(formatDate('2026-09-03T12:00:00Z', 'en-US', { month: 'long' })).toBe('September');
    expect(formatDate('2026-09-03T12:00:00Z', undefined, { month: 'long' })).toBe('septembre');
    expect(formatDate('2026-09-03T12:00:00Z', 'de', { month: 'long' })).toBe('septembre');
  });

  it('returns an empty string for missing or invalid dates', () => {
    expect(formatDate(null, 'fr')).toBe('');
    expect(formatDate('', 'fr')).toBe('');
    expect(formatDate('not a date', 'en')).toBe('');
    expect(formatDateTime(undefined, 'en')).toBe('');
  });

  it('formats date-times with a time part', () => {
    expect(formatDateTime('2026-09-03T12:30:00Z', 'en', { timeZone: 'UTC', hour12: false })).toContain('12:30');
  });

  it('formats numbers with the language separators', () => {
    expect(formatNumber(1234567.5, 'en')).toBe('1,234,567.5');
    expect(formatNumber(1234567.5, 'fr').replace(/\s/g, ' ')).toBe('1 234 567,5');
  });

  // #221 — amounts were glued as `${n} €`: one typography for both languages.
  it('formats amounts with the language typography (#221)', () => {
    const nbsp = (v: string) => v.replace(/[\u00a0\u202f]/g, ' ');
    expect(nbsp(formatCurrency(12.5, 'fr'))).toBe('12,5 €');
    expect(nbsp(formatCurrency(12.5, 'fr', 2))).toBe('12,50 €');
    expect(formatCurrency(12.5, 'en', 2)).toBe('€12.50');
    expect(nbsp(formatCurrency(1234, 'fr'))).toBe('1 234 €');
    expect(formatCurrency(1234, 'en')).toBe('€1,234');
  });

  it('exposes the currency symbol for input suffixes', () => {
    expect(currencySymbol('fr')).toBe('€');
    expect(currencySymbol('en')).toBe('€');
  });
});

describe('profile format preferences (#405)', () => {
  afterEach(() => setFormatPreferences({ tempUnit: 'CELSIUS', dateFormat: 'SYSTEM' }));

  it('shows temperatures in Celsius by default and in Fahrenheit on request', () => {
    expect(formatTemperature(18)).toBe('18°C');
    expect(formatTemperatureRange(16, 18)).toBe('16–18°C');
    setFormatPreferences({ tempUnit: 'FAHRENHEIT' });
    expect(formatTemperature(18)).toBe('64°F');
    expect(formatTemperatureRange(16, 18)).toBe('61–64°F');
  });

  it('forces the 12 or 24 hour clock in date-times when the member chose one', () => {
    const iso = '2026-09-03T15:30:00Z';
    setFormatPreferences({ dateFormat: 'H12' });
    expect(formatDateTime(iso, 'fr', { timeZone: 'UTC' })).toMatch(/PM|pm/i);
    setFormatPreferences({ dateFormat: 'H24' });
    expect(formatDateTime(iso, 'en', { timeZone: 'UTC' })).toMatch(/15:30/);
  });
});

describe('todayLocalIso (#482)', () => {
  it('uses the local calendar date, not the UTC one', () => {
    // 0:30 local time on 12 March: the UTC date may still be the 11th.
    expect(todayLocalIso(new Date(2027, 2, 12, 0, 30))).toBe('2027-03-12');
  });

  it('zero-pads month and day', () => {
    expect(todayLocalIso(new Date(2027, 0, 5, 23, 59))).toBe('2027-01-05');
  });
});

// #834: a purchase day defaults to "today" where the instance is, as the API
// does when none is sent — a browser elsewhere would split one purchase in two lines.
describe('todayInTimeZone (#834)', () => {
  it("gives the instance's day, not the browser's nor UTC's", () => {
    // 23:30 UTC on 15 January: already the 16th in Paris.
    expect(todayInTimeZone('Europe/Paris', new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-16');
    expect(todayInTimeZone('UTC', new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-15');
    expect(todayInTimeZone('America/New_York', new Date('2026-01-16T03:00:00Z'))).toBe('2026-01-15');
  });

  it("falls back to the browser's day without a known zone", () => {
    const now = new Date(2027, 2, 12, 0, 30);
    expect(todayInTimeZone(undefined, now)).toBe(todayLocalIso(now));
    expect(todayInTimeZone('Not/AZone', now)).toBe(todayLocalIso(now));
  });
});
