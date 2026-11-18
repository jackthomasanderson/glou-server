import { describe, it, expect, beforeEach } from 'vitest';
import en from '../../../public/locales/en/common.json';
import fr from '../../../public/locales/fr/common.json';
import { backupFailureInfo, backupAlertSignature, dismissBackupAlert, readDismissedBackupAlert } from '../backupFailure';

// #1048: a failed backup's raw code is a detail; each known code has an explanation.

const lookup = (tree: unknown, key: string) => key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree);

describe('backupFailureInfo (#1048)', () => {
  it.each([
    ['PG_DUMP_SPAWN_FAILED: spawn pg_dump ENOENT', 'PG_DUMP_SPAWN_FAILED'],
    ['PG_DUMP_FAILED (exit 1): connection refused', 'PG_DUMP_FAILED'],
    ['PG_DUMP_TIMED_OUT after 600s', 'PG_DUMP_TIMED_OUT'],
    ['WRITE_FAILED: ENOSPC: no space left on device', 'WRITE_FAILED'],
    ['DATABASE_URL_NOT_SET', 'DATABASE_URL_NOT_SET'],
  ])('maps %s to its own explanation and keeps the raw text', (error, code) => {
    expect(backupFailureInfo(error)).toEqual({ messageKey: `adminConfig.backup.failure.codes.${code}`, raw: error });
  });

  it('falls back to a generic explanation for an unknown or missing error', () => {
    expect(backupFailureInfo('Something odd').messageKey).toBe('adminConfig.backup.failure.unknown');
    expect(backupFailureInfo('EACCES: permission denied').messageKey).toBe('adminConfig.backup.failure.unknown');
    expect(backupFailureInfo(null)).toEqual({ messageKey: 'adminConfig.backup.failure.unknown', raw: null });
  });

  it('has a French and an English text for every key it can return, never the raw code', () => {
    const errors = ['PG_DUMP_SPAWN_FAILED: x', 'PG_DUMP_FAILED (exit 1): x', 'PG_DUMP_TIMED_OUT after 1s', 'PG_DUMP_OUTPUT_FAILED: x',
      'DUMP_STREAM_FAILED: x', 'WRITE_FAILED: x', 'GZIP_FAILED: x', 'FILTER_FAILED: x', 'DATABASE_URL_NOT_SET', 'nope'];
    for (const tree of [en, fr]) {
      for (const error of errors) {
        const text = lookup(tree, backupFailureInfo(error).messageKey);
        expect(typeof text).toBe('string');
        expect(text as string).not.toMatch(/^[A-Z][A-Z0-9_]+[:( ]/);
      }
    }
  });
});

describe('backup banner dismissal (#1048)', () => {
  beforeEach(() => localStorage.clear());

  const NOW = Date.parse('2026-11-18T10:00:00Z');
  const failedRun = (id: string, error: string, lastSuccessAt: string | null = null) =>
    ({ directoryWritable: true, lastRunFailed: true, lastSuccessAt, lastFailure: { id, at: '2026-11-18T03:00:00Z', error } });

  it('keeps the signature through the hourly retry of the same failure, whatever the run', () => {
    const first = backupAlertSignature(failedRun('run-1', 'PG_DUMP_SPAWN_FAILED: a'), NOW);
    expect(backupAlertSignature(failedRun('run-2', 'PG_DUMP_SPAWN_FAILED: b'), NOW + 3_600_000)).toBe(first);
  });

  it('changes it for another cause, or a failure after a new success', () => {
    const base = backupAlertSignature(failedRun('r1', 'PG_DUMP_SPAWN_FAILED: a'), NOW);
    expect(backupAlertSignature(failedRun('r2', 'WRITE_FAILED: ENOSPC'), NOW)).not.toBe(base);
    expect(backupAlertSignature(failedRun('r3', 'PG_DUMP_SPAWN_FAILED: a', '2026-11-18T05:00:00Z'), NOW)).not.toBe(base);
  });

  it('brings the warning back the next day, failed or overdue', () => {
    const failedHealth = failedRun('r1', 'PG_DUMP_SPAWN_FAILED: a');
    expect(backupAlertSignature(failedHealth, NOW)).not.toBe(backupAlertSignature(failedHealth, NOW + 86_400_000));
    const overdue = { directoryWritable: true, overdue: true, lastSuccessAt: '2026-11-10T00:00:00Z' };
    expect(backupAlertSignature(overdue, NOW)).not.toBe(backupAlertSignature(overdue, NOW + 86_400_000));
    expect(backupAlertSignature(overdue, NOW)).toBe(backupAlertSignature(overdue, NOW + 3_600_000));
  });

  it('has no signature when nothing is wrong or unknown', () => {
    expect(backupAlertSignature({ directoryWritable: true, lastRunFailed: false }, NOW)).toBeNull();
    expect(backupAlertSignature(undefined, NOW)).toBeNull();
  });

  it('remembers a dismissal per admin', () => {
    dismissBackupAlert('a1', 'failed:run-1');
    expect(readDismissedBackupAlert('a1')).toBe('failed:run-1');
    expect(readDismissedBackupAlert('a2')).toBeNull();
  });
});
