import { describe, it, expect } from 'vitest';
import { paginationQuerySchema } from '../../src/schemas/pagination.schema';

const schema = paginationQuerySchema({ defaultLimit: 20, maxLimit: 50 });

describe('paginationQuerySchema', () => {
  it('defaults both parameters when the query is empty', () => {
    expect(schema.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it('treats a blank value as absent — a truncated bookmark shows page 1', () => {
    // ISSUE_108: `?page=` used to become NaN and reach Prisma as `skip: NaN`.
    expect(schema.parse({ page: '', limit: '  ' })).toEqual({ page: 1, limit: 20 });
  });

  it('accepts well-formed numeric strings', () => {
    expect(schema.parse({ page: '3', limit: '10' })).toEqual({ page: 3, limit: 10 });
  });

  it('keeps the first value of a repeated key (Express 5 widened query values)', () => {
    expect(schema.parse({ page: ['2', '9'] })).toEqual({ page: 2, limit: 20 });
  });

  it('clamps an oversized limit instead of rejecting it', () => {
    expect(schema.parse({ limit: '5000' })).toEqual({ page: 1, limit: 50 });
  });

  it('rejects a non-numeric page rather than producing NaN', () => {
    const result = schema.safeParse({ page: 'abc' });
    expect(result.success).toBe(false);
  });

  it.each(['0', '-2', '1.5', '1e3', ' 4 2 '])('rejects %s', (page) => {
    expect(schema.safeParse({ page }).success).toBe(false);
  });

  it('never yields NaN for any string input', () => {
    for (const page of ['abc', '', '0', '7', 'Infinity', 'null']) {
      const result = schema.safeParse({ page });
      if (result.success) expect(Number.isInteger(result.data.page)).toBe(true);
    }
  });

  it('honours a per-endpoint default and ceiling', () => {
    const adminSchema = paginationQuerySchema({ defaultLimit: 50, maxLimit: 100 });
    expect(adminSchema.parse({})).toEqual({ page: 1, limit: 50 });
    expect(adminSchema.parse({ limit: '300' })).toEqual({ page: 1, limit: 100 });
  });
});
