import { describe, it, expect } from 'vitest';
import { analyticsQuerySchema } from '../../src/schemas/analytics.schema';

describe('analyticsQuerySchema', () => {
  it('accepts an empty query and leaves both bounds undefined', () => {
    const res = analyticsQuerySchema.safeParse({});
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.from).toBeUndefined();
      expect(res.data.to).toBeUndefined();
    }
  });

  it('parses date-only and full ISO strings into Date objects', () => {
    const res = analyticsQuerySchema.safeParse({ from: '2026-01-01', to: '2026-06-30T12:30:00.000Z' });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.from).toBeInstanceOf(Date);
      expect(res.data.to?.toISOString()).toBe('2026-06-30T12:30:00.000Z');
    }
  });

  it('accepts a lone bound', () => {
    expect(analyticsQuerySchema.safeParse({ from: '2026-01-01' }).success).toBe(true);
    expect(analyticsQuerySchema.safeParse({ to: '2026-01-01' }).success).toBe(true);
  });

  it('treats an empty or blank parameter as absent (no bound)', () => {
    const res = analyticsQuerySchema.safeParse({ from: '', to: '   ' });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.from).toBeUndefined();
      expect(res.data.to).toBeUndefined();
    }
  });

  it('rejects an unparseable date', () => {
    expect(analyticsQuerySchema.safeParse({ from: 'not-a-date' }).success).toBe(false);
    expect(analyticsQuerySchema.safeParse({ to: '2026-13-45' }).success).toBe(false);
  });

  it('rejects a non-string parameter, such as a repeated query key', () => {
    expect(analyticsQuerySchema.safeParse({ from: ['2026-01-01', '2026-02-01'] }).success).toBe(false);
  });

  it('rejects an inverted range', () => {
    expect(analyticsQuerySchema.safeParse({ from: '2026-06-30', to: '2026-01-01' }).success).toBe(false);
  });

  it('accepts a zero-length range (from === to)', () => {
    expect(analyticsQuerySchema.safeParse({ from: '2026-01-01', to: '2026-01-01' }).success).toBe(true);
  });

  it('ignores unknown query parameters', () => {
    const res = analyticsQuerySchema.safeParse({ from: '2026-01-01', unexpected: 'x' });
    expect(res.success).toBe(true);
    if (res.success) expect('unexpected' in res.data).toBe(false);
  });
});
