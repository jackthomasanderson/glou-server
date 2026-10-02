import { z } from 'zod';

// ─── GET /analytics ──────────────────────────────────────────────────────────

// The `from`/`to` range narrows the movement counters only — see
// `ANALYTICS_PERIOD_SCOPE` in `analytics.service.ts`. Inventory aggregates
// always describe the cellar as it stands right now, and the response echoes
// that scope back so clients never present the range as a page-wide filter.

// Query strings carry dates as text; an absent or empty parameter means "no
// bound", anything else must parse as a real date.
const optionalDate = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .string()
    .refine((value) => !Number.isNaN(new Date(value).getTime()), { message: 'INVALID_DATE' })
    .transform((value) => new Date(value))
    .optional()
);

export const analyticsQuerySchema = z
  .object({
    from: optionalDate,
    to: optionalDate,
  })
  .refine(({ from, to }) => !from || !to || from.getTime() <= to.getTime(), {
    message: 'INVALID_DATE_RANGE',
    path: ['to'],
  });

export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>;
