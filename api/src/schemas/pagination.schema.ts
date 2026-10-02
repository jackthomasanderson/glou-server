import { z } from 'zod';
import { firstStr } from '../lib/http';

// Shared pagination contract for every paginated list endpoint.
//
// Hand-rolled `parseInt`/`Math.max` guards used to differ from router to
// router, and `Math.max(1, parseInt('abc', 10))` evaluates to `NaN`, which
// travelled all the way down to Prisma's `skip`/`take` and surfaced as an
// opaque 500 (ISSUE_108). Validating here instead keeps the "validation
// systématique des inputs (Zod)" rule of design.md and gives the caller a
// 400 VALIDATION_ERROR it can act on.

/**
 * A query parameter that must be a positive integer when supplied. Missing or
 * blank (`?page=`, from a truncated bookmark or a shared link) falls back to
 * `fallback` rather than failing, since "no value" is not a client mistake.
 */
function positiveIntParam(fallback: number) {
  return z.preprocess((value) => {
    const raw = firstStr(value)?.trim();
    if (raw === undefined || raw === '') return fallback;
    // Anything that is not a plain run of digits is passed through unchanged so
    // the number schema below rejects it instead of silently becoming NaN.
    return /^\d+$/.test(raw) ? Number(raw) : raw;
  }, z.number().int().min(1));
}

export interface PaginationBounds {
  /** Page size applied when `limit` is absent. */
  defaultLimit?: number;
  /** Hard ceiling — a larger request is clamped, not rejected. */
  maxLimit?: number;
}

export function paginationQuerySchema({
  defaultLimit = 20,
  maxLimit = 50,
}: PaginationBounds = {}) {
  return z.object({
    page: positiveIntParam(1),
    limit: positiveIntParam(defaultLimit).transform((value) => Math.min(value, maxLimit)),
  });
}

export interface Pagination {
  page: number;
  limit: number;
}
