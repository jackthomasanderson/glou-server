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

// 'add_to_stock' targets an InventoryCountEntry that has no itemId yet (a
// physical find with no match in the system, see recordFoundItemSchema
// below) — it references `entryId`, not `itemId`. The other two actions
// still target a real InventoryItem via `itemId`, unchanged.
export const correctionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('mark_consumed'), itemId: z.string().min(1) }),
  z.object({ action: z.literal('move_to_scope'), itemId: z.string().min(1) }),
  z.object({ action: z.literal('add_to_stock'), entryId: z.string().min(1) }),
]);

export const completeSessionSchema = z.object({
  corrections: z.array(correctionSchema).max(500).optional().default([]),
});

export type CorrectionInput = z.infer<typeof correctionSchema>;
export type CompleteSessionInput = z.infer<typeof completeSessionSchema>;

// ─── POST /inventory-count/sessions/:id/found ─────────────────────────────────
// Records a physical find that matches NO existing InventoryItem — the
// "ajouter au stock" corrective action from feature.md (FEAT-12). Category
// reuses the same closed set as the regular inventory input schema;
// quantity is optional context only (see inventory-count.service.ts —
// mapped onto InventoryItem.quantity only for the cigar category, the only
// one where that field exists).

export const recordFoundItemSchema = z.object({
  name: z.string().min(1, 'name is required').max(200),
  category: z.enum(['wine', 'sparkling', 'spirit', 'cigar']),
  quantity: z.number().int().min(1).max(1000).optional(),
});

export type RecordFoundItemInput = z.infer<typeof recordFoundItemSchema>;
