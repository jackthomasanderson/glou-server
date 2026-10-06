import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
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
vi.mock('../../src/lib/prisma', () => ({ prisma: {} }));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn().mockResolvedValue(undefined) }));

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

beforeEach(() => {
  process.env.DATABASE_URL = 'postgresql://glou:pw@db:5432/glou_db';
  psql = new FakePsql();
  spawnMock.mockReset().mockReturnValue(psql);
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
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

afterAll(() => {
  try { fs.unlinkSync(target); } catch { /* already gone */ }
});
