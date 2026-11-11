import { afterEach, describe, expect, it, vi } from 'vitest';
import { manufactureYearSchema, vintageSchema } from '../../src/lib/years';

// #624: one rule for every year of a bottle, its upper bound read at each
// check — a schema built once at start-up accepts next year's vintage on
// 1 January without a restart.
describe('vintageSchema / manufactureYearSchema', () => {
  afterEach(() => vi.useRealTimers());

  it('bounds a vintage from 1800 to this year, with the usual message', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-31T12:00:00Z'));
    const schema = vintageSchema();
    expect(schema.safeParse(1800).success).toBe(true);
    expect(schema.safeParse(1799).success).toBe(false);
    expect(schema.safeParse(2026).success).toBe(true);
    expect(schema.safeParse(2027).error?.issues[0].message).toBe('Too big: expected number to be <=2026');

    vi.setSystemTime(new Date('2027-01-01T12:00:00Z'));
    expect(schema.safeParse(2027).success).toBe(true);
  });

  it('gives the CSV code for every refusal', () => {
    const schema = manufactureYearSchema('INVALID_MANUFACTURE_YEAR');
    for (const value of [1899, new Date().getFullYear() + 1, 1950.5, 'x']) {
      expect(schema.safeParse(value).error?.issues[0].message).toBe('INVALID_MANUFACTURE_YEAR');
    }
    expect(schema.safeParse(1900).success).toBe(true);
  });
});
