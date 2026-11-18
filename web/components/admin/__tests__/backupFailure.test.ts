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
  const failed = (id: string) => ({ directoryWritable: true, lastRunFailed: true, lastFailure: { id, at: '2026-11-18T03:00:00Z', error: 'x' } });

  it('changes signature with each new failed run, so a dismissal does not hide it', () => {
    expect(backupAlertSignature(failed('run-1'))).toBe('failed:run-1');
    expect(backupAlertSignature(failed('run-2'))).not.toBe(backupAlertSignature(failed('run-1')));
    expect(backupAlertSignature({ directoryWritable: true, overdue: true, lastSuccessAt: '2026-11-10T00:00:00Z' })).toBe('overdue:2026-11-10T00:00:00Z');
    expect(backupAlertSignature({ directoryWritable: true, lastRunFailed: false })).toBeNull();
    expect(backupAlertSignature(undefined)).toBeNull();
  });

  it('remembers a dismissal per admin', () => {
    dismissBackupAlert('a1', 'failed:run-1');
    expect(readDismissedBackupAlert('a1')).toBe('failed:run-1');
    expect(readDismissedBackupAlert('a2')).toBeNull();
  });
});
