import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// #232 — a restore replayed `CREATE ...` statements onto the live schema and
// failed at the first existing object ("type AccessMode already exists"). It now
// resets `public` and replays the dump in ONE transaction. Real-Postgres
// behaviour (rollback on a bad dump) was checked by hand against PG16; these
// tests pin the contract of the spawned psql command.

const spawnMock = vi.fn();
vi.mock('child_process', () => ({ spawn: (...a: unknown[]) => spawnMock(...a) }));
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
const auditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/services/audit.service', () => ({ auditLog: (...a: unknown[]) => auditLog(...a) }));

import { backupService, BACKUPS_DIR } from '../../src/services/backup.service';

class FakePsql extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = vi.fn();
  received = '';
  constructor() {
    super();
    this.stdin.on('data', (c: Buffer) => { this.received += c.toString(); });
  }
}

let psql: FakePsql;
const file = 'glou-backup-test-restore.sql.gz';
const target = path.join(BACKUPS_DIR, file);

let safetyBackup: ReturnType<typeof vi.spyOn>;
let sync: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.DATABASE_URL = 'postgresql://glou:pw@db:5432/glou_db';
  psql = new FakePsql();
  spawnMock.mockReset().mockReturnValue(psql);
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  findMany.mockReset().mockResolvedValue([]);
  createMany.mockReset().mockResolvedValue({ count: 0 });
  auditLog.mockClear();
  safetyBackup = vi.spyOn(backupService, 'runBackupUnlocked').mockResolvedValue({ id: 'safety-1', success: true } as never);
  sync = vi.spyOn(backupService, 'syncHistoryWithFiles').mockResolvedValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function writeDump(sql: string, truncate = false) {
  const gz = zlib.gzipSync(sql);
  fs.writeFileSync(target, truncate ? gz.subarray(0, Math.floor(gz.length / 2)) : gz);
}

describe('backupService.restoreBackup (#232)', () => {
  it('runs psql in a single transaction, from an empty public schema', async () => {
    writeDump('CREATE TABLE t (id int);\n');
    const done = backupService.restoreBackup(file, 'u1', '127.0.0.1');
    await new Promise((r) => setTimeout(r, 50));
    psql.emit('close', 0);
    await done;

    const [cmd, args] = spawnMock.mock.calls[0] as [string, string[]];
    expect(cmd).toBe('psql');
    expect(args).toContain('--single-transaction');
    expect(args).toEqual(expect.arrayContaining(['--set', 'ON_ERROR_STOP=on', '--file', '-']));
    expect(psql.received.startsWith('DROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\n')).toBe(true);
    expect(psql.received).toContain('CREATE TABLE t (id int);');
  });

  it('strips a SET transaction_timeout line a newer pg_dump may emit (PG17+ GUC, older server predates it)', async () => {
    writeDump(
      'SET statement_timeout = 0;\nSET transaction_timeout = 0;\nSET lock_timeout = 0;\nCREATE TABLE t (id int);\n',
    );
    const done = backupService.restoreBackup(file, 'u1', '127.0.0.1');
    await new Promise((r) => setTimeout(r, 50));
    psql.emit('close', 0);
    await done;

    expect(psql.received).not.toContain('transaction_timeout');
    // Everything else in the dump must survive untouched.
    expect(psql.received).toContain('SET statement_timeout = 0;');
    expect(psql.received).toContain('SET lock_timeout = 0;');
    expect(psql.received).toContain('CREATE TABLE t (id int);');
  });

  it('kills psql when the dump stream breaks, so no transaction is left open', async () => {
    writeDump('CREATE TABLE t (id int);\n'.repeat(2000), true);
    await expect(backupService.restoreBackup(file, 'u1', '127.0.0.1')).rejects.toThrow(/GUNZIP_FAILED/);
    expect(psql.kill).toHaveBeenCalled();
  });

  it('reports psql failures and does not swallow them', async () => {
    writeDump('CREATE TABLE t (id int);\n');
    const done = backupService.restoreBackup(file, 'u1', '127.0.0.1');
    await new Promise((r) => setTimeout(r, 50));
    psql.stderr.write('ERROR: boom');
    psql.emit('close', 3);
    await expect(done).rejects.toThrow(/PSQL_RESTORE_FAILED \(exit 3\)/);
  });

  it('refuses a missing file', async () => {
    await expect(backupService.restoreBackup('glou-backup-nope.sql.gz', 'u1', '127.0.0.1')).rejects.toThrow('BACKUP_FILE_NOT_FOUND');
  });
});

// #666 — the restore took no copy of the current state first (picking the wrong
// file could not be undone), and replaced the backup history with the dump's:
// every newer backup vanished from the list.
describe('backupService.restoreBackup — safety copy and history (#666)', () => {
  it('takes a backup of the current state before touching the database', async () => {
    writeDump('CREATE TABLE t (id int);\n');
    const done = backupService.restoreBackup(file, 'u1', '127.0.0.1');
    await new Promise((r) => setTimeout(r, 50));
    psql.emit('close', 0);

    await expect(done).resolves.toEqual({ safetyBackupRunId: 'safety-1' });
    expect(safetyBackup).toHaveBeenCalledWith('manual', 'u1', { beforeRestore: true });
    expect(safetyBackup.mock.invocationCallOrder[0]).toBeLessThan(spawnMock.mock.invocationCallOrder[0]);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'BACKUP_RESTORE',
      status: 'success',
      details: expect.objectContaining({ safetyBackupRunId: 'safety-1' }),
    }));
  });

  it('refuses the restore, leaving the database untouched, when the safety copy fails', async () => {
    writeDump('CREATE TABLE t (id int);\n');
    safetyBackup.mockResolvedValue({ id: 'failed-1', success: false, error: 'ENOSPC' } as never);

    await expect(backupService.restoreBackup(file, 'u1', '127.0.0.1')).rejects.toThrow('BACKUP_BEFORE_RESTORE_FAILED');
    expect(spawnMock).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'BACKUP_RESTORE',
      status: 'error',
      details: expect.objectContaining({ error: 'BACKUP_BEFORE_RESTORE_FAILED' }),
    }));
  });

  it('puts back the history the dump predates, safety copy included, then resyncs it with the folder', async () => {
    writeDump('CREATE TABLE t (id int);\n');
    const history = [
      { id: 'safety-1', runAt: new Date('2026-10-30T10:00:00Z'), trigger: 'manual', success: true },
      { id: 'newer', runAt: new Date('2026-10-29T03:00:00Z'), trigger: 'scheduled', success: true },
      { id: 'restored', runAt: new Date('2026-10-27T03:00:00Z'), trigger: 'scheduled', success: true },
    ];
    findMany.mockResolvedValue(history);

    const done = backupService.restoreBackup(file, 'u1', '127.0.0.1');
    await new Promise((r) => setTimeout(r, 50));
    psql.emit('close', 0);
    await done;

    // Read before the dump replaces the table (after the safety copy), written back after.
    expect(findMany.mock.invocationCallOrder[0]).toBeGreaterThan(safetyBackup.mock.invocationCallOrder[0]);
    expect(findMany.mock.invocationCallOrder[0]).toBeLessThan(spawnMock.mock.invocationCallOrder[0]);
    expect(createMany).toHaveBeenCalledWith({ data: history, skipDuplicates: true });
    expect(createMany.mock.invocationCallOrder[0]).toBeGreaterThan(spawnMock.mock.invocationCallOrder[0]);
    expect(sync).toHaveBeenCalled();
  });

  it('still reports a restore that worked when putting the history back fails', async () => {
    writeDump('CREATE TABLE t (id int);\n');
    findMany.mockResolvedValue([{ id: 'r1' }]);
    createMany.mockRejectedValue(new Error('column does not exist'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const done = backupService.restoreBackup(file, 'u1', '127.0.0.1');
    await new Promise((r) => setTimeout(r, 50));
    psql.emit('close', 0);

    await expect(done).resolves.toEqual({ safetyBackupRunId: 'safety-1' });
  });

  it('does not put the history back when the restore itself failed (the database was rolled back)', async () => {
    writeDump('CREATE TABLE t (id int);\n');
    const done = backupService.restoreBackup(file, 'u1', '127.0.0.1');
    await new Promise((r) => setTimeout(r, 50));
    psql.emit('close', 3);

    await expect(done).rejects.toThrow(/PSQL_RESTORE_FAILED/);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('makes another backup wait until the restore is over', async () => {
    writeDump('CREATE TABLE t (id int);\n');
    const restoring = backupService.restoreBackup(file, 'u1', '127.0.0.1');
    await new Promise((r) => setTimeout(r, 50));
    const nightly = backupService.runBackup('scheduled');
    await new Promise((r) => setTimeout(r, 50));
    // Only the safety copy so far: psql is still running.
    expect(safetyBackup).toHaveBeenCalledTimes(1);

    psql.emit('close', 0);
    await restoring;
    await nightly;
    expect(safetyBackup).toHaveBeenCalledTimes(2);
    expect(safetyBackup).toHaveBeenLastCalledWith('scheduled', undefined, {});
  });

  it('checks the file exists before taking any safety copy', async () => {
    await expect(backupService.restoreBackup('glou-backup-nope.sql.gz', 'u1', '127.0.0.1')).rejects.toThrow('BACKUP_FILE_NOT_FOUND');
    expect(safetyBackup).not.toHaveBeenCalled();
  });
});

afterAll(() => {
  try { fs.unlinkSync(target); } catch { /* already gone */ }
});
