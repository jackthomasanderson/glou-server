import { Prisma } from '@prisma/client';

/**
 * ISSUE_172: Prisma aggregates (`_sum`/`_avg`/`_min`/`_max` on a Decimal
 * column) always return a `Prisma.Decimal` instance — the result-field
 * extension in `lib/prisma.ts` only rewrites plain model reads, not
 * aggregate output. Call this at every aggregate call site instead of
 * assuming the value is already a `number`.
 *
 * Accepts a plain `number` too so service-layer unit tests that mock
 * Prisma with literal numbers (the existing pattern throughout
 * `api/tests`) keep working unchanged against this same conversion.
 */
export function toNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' ? value : value.toNumber();
}
