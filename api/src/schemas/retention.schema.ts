import { z } from 'zod';

// FEAT-39: Maintenance & Data Retention — admin-configurable retention windows.
// Bounds: at least 1 day (0 would mean "delete immediately", which is never
// the intent of a retention *delay*), capped at ~10 years to avoid fat-fingered
// unbounded values.
const retentionDays = z.coerce.number().int().min(1).max(3650);

export const retentionConfigSchema = z.object({
  logRetentionDays: retentionDays,
  sessionRetentionDays: retentionDays,
  guestShareRetentionDays: retentionDays,
});

export type RetentionConfigInput = z.infer<typeof retentionConfigSchema>;

export const maintenanceRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
