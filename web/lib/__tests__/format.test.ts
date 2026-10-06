import { describe, it, expect } from 'vitest';
import { currencySymbol, formatCurrency, formatDate, formatDateTime, formatNumber } from '../format';

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
