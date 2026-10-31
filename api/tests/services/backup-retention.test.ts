import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// design.md "Sauvegarde & Migration": the backup taken before a migration is
// the only way back to the previous version, so the 7-day retention must
// never delete it; the administrator removes it. The folder is stubbed: other
// suites write to the real one concurrently.

const findUnique = vi.fn();
vi.mock('../../src/lib/prisma', () => ({
  prisma: { systemConfig: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn() }));
vi.mock('../../src/services/notification.service', () => ({ notificationService: { send: vi.fn() } }));

import { backupService, BACKUPS_DIR } from '../../src/services/backup.service';
import { backupFileName, isBeforeMigrationBackup } from '../../src/lib/pg-dump';

const OLD = Date.now() - 30 * 24 * 60 * 60 * 1000;
const RECENT = Date.now() - 60 * 60 * 1000;

let unlinked: string[];

function folderWith(files: Record<string, number>) {
  vi.spyOn(fs, 'readdirSync').mockReturnValue(Object.keys(files) as never);
  vi.spyOn(fs, 'statSync').mockImplementation(((p: fs.PathLike) =>
    ({ mtimeMs: files[path.basename(String(p))] }) as fs.Stats) as typeof fs.statSync);
  vi.spyOn(fs, 'unlinkSync').mockImplementation(((p: fs.PathLike) => { unlinked.push(path.basename(String(p))); }) as typeof fs.unlinkSync);
}

beforeEach(() => {
  unlinked = [];
  findUnique.mockReset().mockResolvedValue({ backupRetentionDays: 7 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('backupService.enforceRetention', () => {
  it('deletes old regular backups but keeps every backup taken before a migration', async () => {
    folderWith({
      'glou-backup-2026-09-01T03-00-00-000Z.sql.gz': OLD,
      'glou-backup-2026-10-30T03-00-00-000Z.sql.gz': RECENT,
      'glou-backup-before-migration-2026-09-01T08-30-00-123Z.sql.gz': OLD,
      'notes.txt': OLD,
    });

    await backupService.enforceRetention();

    expect(unlinked).toEqual(['glou-backup-2026-09-01T03-00-00-000Z.sql.gz']);
  });
});

describe('backup file names', () => {
  it('names the pre-migration backup recognisably, the regular one as before', () => {
    const at = new Date('2026-11-01T08:30:00.123Z');
    expect(backupFileName(at)).toBe('glou-backup-2026-11-01T08-30-00-123Z.sql.gz');
    expect(backupFileName(at, { beforeMigration: true })).toBe('glou-backup-before-migration-2026-11-01T08-30-00-123Z.sql.gz');
  });

  it('only a backup file named so is exempt from retention', () => {
    expect(isBeforeMigrationBackup('glou-backup-before-migration-2026-11-01T08-30-00-123Z.sql.gz')).toBe(true);
    expect(isBeforeMigrationBackup('glou-backup-2026-11-01T08-30-00-123Z.sql.gz')).toBe(false);
    expect(isBeforeMigrationBackup('glou-backup-before-migration-notes.txt')).toBe(false);
  });

  it('keeps BACKUPS_DIR exported from the backup service', () => {
    expect(BACKUPS_DIR).toBe(path.resolve(process.cwd(), 'backups'));
  });
});
