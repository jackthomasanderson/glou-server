import { z } from 'zod';

// ─── Task 4: Humidor Hygrometric Monitoring ──────────────────────────────────
// See schema.prisma's HumidorReading comment for the "why Cellar, not
// InventoryItem" rationale. `source` is always 'manual' (the web form): no
// sensor bridge exists (#468, climate sensors dropped in #747).

export const humidorReadingSourceValues = ['manual'] as const;

export const recordHumidorReadingSchema = z.object({
  cellarId: z.string().min(1),
  humidityPercent: z.number().min(0).max(100),
  temperatureCelsius: z.number().min(-20).max(60).optional().nullable(),
  recordedAt: z.coerce.date().optional(),
  source: z.enum(humidorReadingSourceValues).optional().default('manual'),
});

export type RecordHumidorReadingInput = z.infer<typeof recordHumidorReadingSchema>;

// #636: `take` for the history query — a whole number, 1 to 100 (1.5 used to
// reach Prisma as is).
export const humidorHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
