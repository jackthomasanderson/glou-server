import { z } from 'zod';

// ─── POST /wishlist/budget-envelopes ──────────────────────────────────────────

export const budgetEnvelopeCreateSchema = z
  .object({
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    amount: z.number().min(0).max(10_000_000),
  })
  .refine((data) => data.periodEnd > data.periodStart, {
    message: 'periodEnd must be after periodStart',
    path: ['periodEnd'],
  });

export type BudgetEnvelopeCreateInput = z.infer<typeof budgetEnvelopeCreateSchema>;

// ─── PATCH /wishlist/budget-envelopes/:id ────────────────────────────────────

export const budgetEnvelopePatchSchema = z.object({
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  amount: z.number().min(0).max(10_000_000).optional(),
});

export type BudgetEnvelopePatchInput = z.infer<typeof budgetEnvelopePatchSchema>;
