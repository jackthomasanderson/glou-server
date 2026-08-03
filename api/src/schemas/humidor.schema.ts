import { z } from 'zod';

// ─── Task 4: Humidor Hygrometric Monitoring ──────────────────────────────────
// See schema.prisma's HumidorReading comment for the "why Cellar, not
// InventoryItem" rationale. `source` defaults to 'manual' (the only path
// actually wired up in this pass — the web form); 'sensor' is reserved for a
// future physical bridge posting to the same endpoint.

export const humidorReadingSourceValues = ['manual', 'sensor'] as const;

export const recordHumidorReadingSchema = z.object({
  cellarId: z.string().min(1),
  humidityPercent: z.number().min(0).max(100),
  temperatureCelsius: z.number().min(-20).max(60).optional().nullable(),
  recordedAt: z.coerce.date().optional(),
  source: z.enum(humidorReadingSourceValues).optional().default('manual'),
});

export type RecordHumidorReadingInput = z.infer<typeof recordHumidorReadingSchema>;
