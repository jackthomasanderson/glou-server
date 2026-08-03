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
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional().nullable(),
  type: z.nativeEnum(CellarType).default('VINTAGE'),
  // Grid plan configuration (FEAT-68)
  columns: z.number().int().min(1).max(100).optional().nullable(),
  rows: z.number().int().min(1).max(100).optional().nullable(),
  hotZoneRows: z.number().int().min(0).max(100).optional().nullable(),
  coldZoneRows: z.number().int().min(0).max(100).optional().nullable(),
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
