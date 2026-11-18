import type { BackupHealth } from '@shared/maintenance';
import { glouKey, safeReadStorage, safeWriteStorage } from '@/lib/safe-storage';

/**
 * #1048: the codes the API records in a failed backup's `error` ("CODE: detail"
 * or "CODE (exit 1): detail"), each with a translated explanation under
 * `adminConfig.backup.failure.codes`. Anything else falls back to `unknown`.
 */
const KNOWN_CODES = new Set([
  'PG_DUMP_SPAWN_FAILED',
  'PG_DUMP_FAILED',
  'PG_DUMP_TIMED_OUT',
  'PG_DUMP_OUTPUT_FAILED',
  'WRITE_FAILED',
  'GZIP_FAILED',
  'FILTER_FAILED',
  'DUMP_STREAM_FAILED',
  'DATABASE_URL_NOT_SET',
]);

export interface BackupFailureInfo {
  /** The i18n key of the explanation, with what to do. */
  messageKey: string;
  /** What the API recorded, shown only as a detail. */
  raw: string | null;
}

export function backupFailureInfo(error: string | null | undefined): BackupFailureInfo {
  const raw = error?.trim() || null;
  const code = raw ? /^[A-Z][A-Z0-9_]+/.exec(raw)?.[0] : undefined;
  return {
    messageKey: `adminConfig.backup.failure.${code && KNOWN_CODES.has(code) ? `codes.${code}` : 'unknown'}`,
    raw,
  };
}

/**
 * #1048: what the banner is about, as a string that changes with every new
 * failure (the failed run's id) or new overdue period (the last success), so a
 * dismissal never hides a later problem.
 */
export function backupAlertSignature(health: BackupHealth | null | undefined): string | null {
  if (!health) return null;
  if (health.lastRunFailed === true) return `failed:${health.lastFailure?.id ?? 'unknown'}`;
  if (health.overdue === true) return `overdue:${String(health.lastSuccessAt ?? '')}`;
  return null;
}

const dismissKey = (userId: string) => glouKey(`backup-banner-dismissed:${userId}`);

export const readDismissedBackupAlert = (userId: string): string | null => safeReadStorage('local', dismissKey(userId));
export const dismissBackupAlert = (userId: string, signature: string): void => safeWriteStorage('local', dismissKey(userId), signature);
