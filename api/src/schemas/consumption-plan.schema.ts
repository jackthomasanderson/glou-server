import { z } from 'zod';

// ─── GET /consumption-plan/suggestions ───────────────────────────────────────

export const suggestionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(7),
});

export type SuggestionsQuery = z.infer<typeof suggestionsQuerySchema>;

// ─── PATCH /consumption-plan/items/:id/postpone ──────────────────────────────

export const postponeSchema = z.object({
  days: z.number().int().min(1).max(90).optional().default(7),
});

export type PostponeInput = z.infer<typeof postponeSchema>;

// ─── PUT /consumption-plan/goal ──────────────────────────────────────────────

export const setGoalSchema = z
  .object({
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    targetType: z.enum(['volume', 'count']),
    targetValue: z.number().int().min(1).max(10000),
  })
  .refine((data) => data.periodEnd > data.periodStart, {
    message: 'periodEnd must be after periodStart',
    path: ['periodEnd'],
  });

export type SetGoalInput = z.infer<typeof setGoalSchema>;
