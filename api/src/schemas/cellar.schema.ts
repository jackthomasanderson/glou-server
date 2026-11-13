import { z } from 'zod';
import { CellarType } from '@prisma/client';

const zonesValid = (data: { rows?: number | null; hotZoneRows?: number | null; coldZoneRows?: number | null }) => {
  if (data.rows != null && (data.hotZoneRows ?? 0) + (data.coldZoneRows ?? 0) > data.rows) {
    return false;
  }
  return true;
};

const humidityRangeValid = (data: { targetHumidityMin?: number | null; targetHumidityMax?: number | null }) => {
  if (data.targetHumidityMin != null && data.targetHumidityMax != null) {
    return data.targetHumidityMin <= data.targetHumidityMax;
  }
  return true;
};

const cellarFields = z.object({
  // #869: trimmed, so a name made only of spaces is refused as empty.
  name: z.string().trim().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional().nullable(),
  type: z.nativeEnum(CellarType).default('VINTAGE'),
  // Grid plan configuration (FEAT-68). Capped at 30x30 (900 cells, ISSUE_388):
  // the grid renders one interactive component and one tooltip per slot,
  // with no virtualization — 100x100 (10,000 slots) was never renderable.
  columns: z.number().int().min(1).max(30).optional().nullable(),
  rows: z.number().int().min(1).max(30).optional().nullable(),
  hotZoneRows: z.number().int().min(0).max(30).optional().nullable(),
  coldZoneRows: z.number().int().min(0).max(30).optional().nullable(),
  // Humidor monitoring (Task 4, expert mode only) — target hygrometry range
  // used to flag drift on the latest HumidorReading.
  targetHumidityMin: z.number().min(0).max(100).optional().nullable(),
  targetHumidityMax: z.number().min(0).max(100).optional().nullable(),
});

export const cellarBaseSchema = cellarFields
  .refine(zonesValid, {
    message: 'Hot zone and cold zone rows cannot exceed total rows',
    path: ['hotZoneRows'],
  })
  .refine(humidityRangeValid, {
    message: 'targetHumidityMin cannot exceed targetHumidityMax',
    path: ['targetHumidityMin'],
  });

export const createCellarSchema = cellarBaseSchema;

export const updateCellarSchema = cellarFields
  .partial()
  // zod 4 applies a field's .default() even under .partial(): a PATCH that
  // omits `type` must leave it unchanged, not reset it to VINTAGE.
  .extend({ type: cellarFields.shape.type.unwrap().optional() })
  .refine(zonesValid, {
    message: 'Hot zone and cold zone rows cannot exceed total rows',
    path: ['hotZoneRows'],
  })
  .refine(humidityRangeValid, {
    message: 'targetHumidityMin cannot exceed targetHumidityMax',
    path: ['targetHumidityMin'],
  });

export type CreateCellarInput = z.infer<typeof createCellarSchema>;
export type UpdateCellarInput = z.infer<typeof updateCellarSchema>;

// ISSUE_037: the client only ever names the two slots being swapped — the
// cells they end up in are read back from their own current positions
// server-side (see slotService.swap), so a stale or spoofed
// coordinate in the request body can't desynchronise the grid. FEAT-93: by
// slot (a unit may hold several cells), no longer by unit.
export const swapSlotsSchema = z.object({
  slotAId: z.string().guid(),
  slotBId: z.string().guid(),
}).refine((data) => data.slotAId !== data.slotBId, {
  message: 'slotAId and slotBId must be different slots',
  path: ['slotBId'],
});

// FEAT-93: a cell of the grid, 1-based, within the API's bounds (the
// database's `item_slots_cell_range`); the cellar's own size is checked by
// the service.
export const slotCellSchema = z.object({
  column: z.number().int().min(1).max(100),
  row: z.number().int().min(1).max(100),
}).strict();

export type SlotCellInput = z.infer<typeof slotCellSchema>;
export type SwapSlotsInput = z.infer<typeof swapSlotsSchema>;
