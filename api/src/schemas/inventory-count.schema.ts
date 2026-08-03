import { z } from 'zod';

// ─── POST /inventory-count/sessions ──────────────────────────────────────────

export const startSessionSchema = z.object({
  scopeLabel: z.string().min(1, 'scopeLabel is required').max(120),
  cellarId: z.string().min(1).optional().nullable(),
});

export type StartSessionInput = z.infer<typeof startSessionSchema>;

// ─── POST /inventory-count/sessions/:id/scan ─────────────────────────────────

export const scanSchema = z.object({
  itemId: z.string().min(1, 'itemId is required'),
});

export type ScanInput = z.infer<typeof scanSchema>;

// ─── POST /inventory-count/sessions/:id/complete ─────────────────────────────

export const correctionActionValues = ['mark_consumed', 'move_to_scope'] as const;

export const correctionSchema = z.object({
  itemId: z.string().min(1),
  action: z.enum(correctionActionValues),
});

export const completeSessionSchema = z.object({
  corrections: z.array(correctionSchema).max(500).optional().default([]),
});

export type CorrectionInput = z.infer<typeof correctionSchema>;
export type CompleteSessionInput = z.infer<typeof completeSessionSchema>;
