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

const DAY_MS = 86_400_000;

/**
 * #1048: what the banner is about, so that hiding it lasts. A failing install
 * retries every hour (each retry a new run), so the signature is the streak —
 * the last success it follows and the cause — not the run: a success then a
 * new failure, or another cause, brings the banner back; the hourly retry of
 * the same cause does not. The day makes it come back once a day, as a data-loss
 * warning must not be silenced for good (an overdue backup changes nothing else
 * until a backup succeeds).
 */
export function backupAlertSignature(health: BackupHealth | null | undefined, now: number = Date.now()): string | null {
  if (!health) return null;
  const day = Math.floor(now / DAY_MS);
  const since = String(health.lastSuccessAt ?? 'never');
  if (health.lastRunFailed === true) {
    const code = /^[A-Z][A-Z0-9_]+/.exec(health.lastFailure?.error ?? '')?.[0] ?? 'unknown';
    return `failed:${since}:${code}:${day}`;
  }
  if (health.overdue === true) return `overdue:${since}:${day}`;
  return null;
}

const dismissKey = (userId: string) => glouKey(`backup-banner-dismissed:${userId}`);

export const readDismissedBackupAlert = (userId: string): string | null => safeReadStorage('local', dismissKey(userId));
export const dismissBackupAlert = (userId: string, signature: string): void => safeWriteStorage('local', dismissKey(userId), signature);
