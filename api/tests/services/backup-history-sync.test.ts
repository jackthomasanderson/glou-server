import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// #666 — the backup history is read from the database, and a restore replaces
// the database: every backup newer than the restored one vanished from the
// list, and a file copied by hand into ./backups (recovery on a new machine)
// never showed up. The history is now resynchronised with the folder at
// startup and after every restore. The folder is stubbed: other suites write
// to the real one concurrently.

const findMany = vi.fn();
const createMany = vi.fn();
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    backupRun: {
      findMany: (...a: unknown[]) => findMany(...a),
      createMany: (...a: unknown[]) => createMany(...a),
    },
  },
}));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn() }));
vi.mock('../../src/services/notification.service', () => ({ notificationService: { send: vi.fn() } }));

import { backupService, BACKUPS_DIR } from '../../src/services/backup.service';

const MTIME = new Date('2026-01-01T00:00:00Z');

/** Stubs the backups folder with these files (name → size in bytes). */
function folderWith(files: Record<string, number>) {
  vi.spyOn(fs, 'readdirSync').mockReturnValue(Object.keys(files) as never);
  vi.spyOn(fs, 'statSync').mockImplementation(((p: fs.PathLike) => {
    const size = files[path.basename(String(p))];
    if (size === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return { isFile: () => true, size, mtime: MTIME } as fs.Stats;
  }) as typeof fs.statSync);
}

const knownRows = (...names: string[]) => names.map((n) => ({ filePath: path.join(BACKUPS_DIR, n) }));

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
  createMany.mockReset().mockResolvedValue({ count: 0 });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('backupService.syncHistoryWithFiles (#666)', () => {
  it('lists a backup file the history does not know, dated from its name and sized from the disk', async () => {
    folderWith({ 'glou-backup-2026-10-28T03-00-01-234Z.sql.gz': 4096 });

    const added = await backupService.syncHistoryWithFiles();

    expect(added).toBe(1);
    expect(createMany).toHaveBeenCalledWith({
      data: [{
        trigger: 'manual',
        userId: null,
        success: true,
        filePath: path.join(BACKUPS_DIR, 'glou-backup-2026-10-28T03-00-01-234Z.sql.gz'),
        fileSizeBytes: 4096,
        runAt: new Date('2026-10-28T03:00:01.234Z'),
      }],
    });
  });

  it('leaves alone the files already in the history, matched by file name', async () => {
    folderWith({
      'glou-backup-2026-10-27T03-00-00-000Z.sql.gz': 100,
      'glou-backup-2026-10-28T03-00-00-000Z.sql.gz': 200,
    });
    // A row recorded under another absolute path (other machine) still matches.
    findMany.mockResolvedValue([
      ...knownRows('glou-backup-2026-10-27T03-00-00-000Z.sql.gz'),
      { filePath: '/elsewhere/backups/glou-backup-2026-10-28T03-00-00-000Z.sql.gz' },
    ]);

    expect(await backupService.syncHistoryWithFiles()).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
    // Only successful runs with a file count as known.
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { success: true, filePath: { not: null } },
    }));
  });

  it('dates a hand-named backup file from the disk', async () => {
    folderWith({ 'glou-backup-from-the-old-server.sql.gz': 512 });

    await backupService.syncHistoryWithFiles();

    expect(createMany.mock.calls[0][0].data[0]).toMatchObject({ runAt: MTIME, fileSizeBytes: 512 });
  });

  it('ignores other files and empty backup files', async () => {
    folderWith({
      'notes.txt': 10,
      'glou-backup-2026-10-28T03-00-00-000Z.sql': 10,
      'glou-backup-2026-10-29T03-00-00-000Z.sql.gz': 0,
    });

    expect(await backupService.syncHistoryWithFiles()).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('does nothing when the folder cannot be read', async () => {
    vi.spyOn(fs, 'readdirSync').mockImplementation(() => { throw new Error('EACCES'); });

    expect(await backupService.syncHistoryWithFiles()).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
