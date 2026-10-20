import { z } from 'zod';

// FEAT-18: Portabilité & Souveraineté des Données — Scheduled Backups (pg_dump).
// Bounds mirror retention.schema.ts (min 1 day, max ~10 years).
const retentionDays = z.coerce.number().int().min(1).max(3650);

export const backupConfigSchema = z.object({
  backupEnabled: z.boolean(),
  backupRetentionDays: retentionDays,
  backupHourUtc: z.coerce.number().int().min(0).max(23),
});

export type BackupConfigInput = z.infer<typeof backupConfigSchema>;

export const backupRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// Restore is destructive (overwrites all current data) — a bare admin session
// is not enough, the frontend must send an explicit `confirm: true` on top of
// its own confirmation-keyword modal, so a scripted/direct API call can never
// trigger a restore by accident.
export const backupRestoreSchema = z.object({
  confirm: z.literal(true),
  // #489: the admin re-enters their password.
  password: z.string().min(1),
});

/** #489: downloading a dump (every password hash and 2FA secret) re-asks the password. */
export const backupDownloadSchema = z.object({
  password: z.string().min(1),
});

/** #489: the full purge re-asks the password on top of the typed keyword. */
export const purgeSchema = z.object({
  confirmation: z.literal('SUPPRIMER'),
  password: z.string().min(1),
});

export type BackupRestoreInput = z.infer<typeof backupRestoreSchema>;
