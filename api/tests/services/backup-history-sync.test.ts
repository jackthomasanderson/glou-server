import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough, Writable } from 'stream';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// #666 — the backup history is read from the database, and a restore replaces
// the database: every backup newer than the restored one vanished from the
// list, and a file copied by hand into ./backups (recovery on a new machine)
// never showed up. The history is now resynchronised with the folder at
// startup and after every restore. The folder is stubbed: other suites write
// to the real one concurrently.

const spawnMock = vi.fn();
vi.mock('child_process', () => ({ spawn: (...a: unknown[]) => spawnMock(...a) }));
const findMany = vi.fn();
const createMany = vi.fn();
const create = vi.fn();
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    backupRun: {
      findMany: (...a: unknown[]) => findMany(...a),
      createMany: (...a: unknown[]) => createMany(...a),
      create: (...a: unknown[]) => create(...a),
    },
  },
}));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn() }));
vi.mock('../../src/services/notification.service', () => ({ notificationService: { send: vi.fn() } }));

import { backupService, BACKUPS_DIR } from '../../src/services/backup.service';

const MTIME = new Date('2026-01-01T00:00:00Z');

/** A complete backup file (gzip of a small SQL dump). */
const backup = (sql = '-- PostgreSQL database dump\nCREATE TABLE t (id int);\n') => zlib.gzipSync(sql);

/** Stubs the backups folder with these files (name → content). */
function folderWith(files: Record<string, Buffer>) {
  const content = (p: fs.PathLike) => {
    const buf = files[path.basename(String(p))];
    if (buf === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return buf;
  };
  vi.spyOn(fs, 'readdirSync').mockReturnValue(Object.keys(files) as never);
  vi.spyOn(fs, 'statSync').mockImplementation(((p: fs.PathLike) =>
    ({ isFile: () => true, size: content(p).length, mtime: MTIME }) as fs.Stats) as typeof fs.statSync);
  vi.spyOn(fs, 'createReadStream').mockImplementation(((p: fs.PathLike) =>
    new PassThrough().end(content(p))) as unknown as typeof fs.createReadStream);
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
    const file = backup();
    folderWith({ 'glou-backup-2026-10-28T03-00-01-234Z.sql.gz': file });

    const added = await backupService.syncHistoryWithFiles();

    expect(added).toBe(1);
    expect(createMany).toHaveBeenCalledWith({
      data: [{
        trigger: 'manual',
        userId: null,
        success: true,
        filePath: path.join(BACKUPS_DIR, 'glou-backup-2026-10-28T03-00-01-234Z.sql.gz'),
        fileSizeBytes: file.length,
        runAt: new Date('2026-10-28T03:00:01.234Z'),
      }],
    });
  });

  it('leaves alone the files already in the history, matched by file name', async () => {
    folderWith({
      'glou-backup-2026-10-27T03-00-00-000Z.sql.gz': backup(),
      'glou-backup-2026-10-28T03-00-00-000Z.sql.gz': backup(),
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
    const file = backup();
    folderWith({ 'glou-backup-from-the-old-server.sql.gz': file });

    await backupService.syncHistoryWithFiles();

    expect(createMany.mock.calls[0][0].data[0]).toMatchObject({ runAt: MTIME, fileSizeBytes: file.length });
  });

  it('ignores other files and empty backup files', async () => {
    folderWith({
      'notes.txt': backup(),
      'glou-backup-2026-10-28T03-00-00-000Z.sql': backup(),
      'glou-backup-2026-10-29T03-00-00-000Z.sql.gz': Buffer.alloc(0),
    });

    expect(await backupService.syncHistoryWithFiles()).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  // A pg_dump killed mid-way (container stopped during the nightly backup)
  // leaves a truncated file: listed as successful, it would pass for the
  // latest good backup and hold back the catch-up run for a day.
  it('does not list a truncated backup file, nor one that is not gzip', async () => {
    const full = backup('CREATE TABLE t (id int);\n'.repeat(2000));
    folderWith({
      'glou-backup-2026-10-28T03-00-00-000Z.sql.gz': full.subarray(0, Math.floor(full.length / 2)),
      'glou-backup-2026-10-29T03-00-00-000Z.sql.gz': Buffer.from('CREATE TABLE t (id int);\n'),
      'glou-backup-2026-10-30T03-00-00-000Z.sql.gz': full,
    });

    expect(await backupService.syncHistoryWithFiles()).toBe(1);
    expect(createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ filePath: path.join(BACKUPS_DIR, 'glou-backup-2026-10-30T03-00-00-000Z.sql.gz') }),
    ]);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('glou-backup-2026-10-28T03-00-00-000Z.sql.gz is truncated'));
  });

  it('does nothing when the folder cannot be read', async () => {
    vi.spyOn(fs, 'readdirSync').mockImplementation(() => { throw new Error('EACCES'); });

    expect(await backupService.syncHistoryWithFiles()).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});

class FakeDump extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = vi.fn();
}

describe('backupService.syncHistoryWithFiles — backup being written (#666)', () => {
  it('does not list the file of a backup still in progress', async () => {
    process.env.DATABASE_URL = 'postgresql://glou:pw@db:5432/glou_db';
    const dump = new FakeDump();
    spawnMock.mockReturnValue(dump);
    let writing = '';
    vi.spyOn(fs, 'createWriteStream').mockImplementation(((p: fs.PathLike) => {
      writing = path.basename(String(p));
      return new Writable({ write(_c, _e, cb) { cb(); } });
    }) as unknown as typeof fs.createWriteStream);
    vi.spyOn(backupService, 'enforceRetention').mockResolvedValue(undefined);
    create.mockResolvedValue({ id: 'r1', success: true });

    const run = backupService.runBackup('scheduled');
    expect(writing).toMatch(/^glou-backup-\d{4}-.*\.sql\.gz$/);
    // Its first bytes may already be a valid gzip start: only the name tells.
    folderWith({ [writing]: backup() });

    expect(await backupService.syncHistoryWithFiles()).toBe(0);
    expect(createMany).not.toHaveBeenCalled();

    dump.stdout.end('CREATE TABLE t (id int);\n');
    dump.emit('close', 0);
    await run;
    // Finished: its row is written by runBackup itself.
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ success: true }) }));
  });
});
