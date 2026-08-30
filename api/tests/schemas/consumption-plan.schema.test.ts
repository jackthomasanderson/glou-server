import { describe, it, expect } from 'vitest';
import {
  suggestionsQuerySchema,
  postponeSchema,
  setGoalSchema,
} from '../../src/schemas/consumption-plan.schema';

describe('suggestionsQuerySchema', () => {
  it('defaults limit to 7 and coerces a query-string number', () => {
    expect(suggestionsQuerySchema.parse({})).toEqual({ limit: 7 });
    expect(suggestionsQuerySchema.parse({ limit: '20' })).toEqual({ limit: 20 });
  });

  it('rejects limit outside 1..50', () => {
    expect(suggestionsQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(suggestionsQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
  });
});

describe('postponeSchema', () => {
  it('defaults days to 7', () => {
    expect(postponeSchema.parse({})).toEqual({ days: 7 });
  });

  it('bounds days to 1..90', () => {
    expect(postponeSchema.safeParse({ days: 0 }).success).toBe(false);
    expect(postponeSchema.safeParse({ days: 91 }).success).toBe(false);
  });
});

describe('setGoalSchema', () => {
  const base = {
    periodStart: '2026-01-01',
    periodEnd: '2026-12-31',
    targetType: 'volume' as const,
    targetValue: 12,
  };

  it('accepts a well-ordered period', () => {
    expect(setGoalSchema.safeParse(base).success).toBe(true);
  });

  it('rejects periodEnd not strictly after periodStart', () => {
    const res = setGoalSchema.safeParse({ ...base, periodEnd: '2026-01-01' });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues[0].path).toEqual(['periodEnd']);
  });

  it('rejects an unknown targetType and a non-positive targetValue', () => {
    expect(setGoalSchema.safeParse({ ...base, targetType: 'weight' }).success).toBe(false);
    expect(setGoalSchema.safeParse({ ...base, targetValue: 0 }).success).toBe(false);
  });
});
