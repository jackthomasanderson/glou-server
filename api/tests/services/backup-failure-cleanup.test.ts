import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough, Writable } from 'stream';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// #182 — pg_dump creates the destination file before it has dumped anything. When
// it then failed, the truncated .sql.gz stayed in the backups folder and looked
// like a valid backup (it even gets listed and can be "restored").
// #670 — success was decided when pg_dump exited, before the compressed file was
// fully written: a write error at the very end (full disk) was ignored.
// #665 — the file kept a `SET transaction_timeout` line a PostgreSQL 15 server
// rejects, so the documented `gunzip | psql` recovery failed on every backup.

const spawnMock = vi.fn();
vi.mock('child_process', () => ({ spawn: (...a: unknown[]) => spawnMock(...a) }));
const runCreate = vi.fn().mockResolvedValue({ id: 'r1', success: false });
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    backupRun: { findFirst: vi.fn().mockResolvedValue(null), create: (...a: unknown[]) => runCreate(...a) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn() }));
vi.mock('../../src/services/notification.service', () => ({ notificationService: { send: vi.fn() } }));

import { backupService, BACKUPS_DIR } from '../../src/services/backup.service';

class FakeDump extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  // A killed process exits: 'close' follows, with no exit code.
  kill = vi.fn(() => {
    setImmediate(() => this.emit('close', null));
    return true;
  });
}

const realCreateWriteStream = fs.createWriteStream;
type CreateWriteStream = typeof fs.createWriteStream;

/** A file stream that writes to disk for real but lets the test decide how it ends. */
function fileStreamEndingWith(end: (realStream: fs.WriteStream, callback: (err?: Error | null) => void) => void): CreateWriteStream {
  return ((target: fs.PathLike, options?: Parameters<CreateWriteStream>[1]) => {
    const real = realCreateWriteStream(target, options);
    return new Writable({
      write(chunk: Buffer, _enc, callback) { real.write(chunk, callback); },
      final(callback) { end(real, callback); },
    }) as unknown as fs.WriteStream;
  }) as CreateWriteStream;
}

const diskFull = () => Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' });

const before = new Set<string>(fs.existsSync(BACKUPS_DIR) ? fs.readdirSync(BACKUPS_DIR) : []);
// Only files named like runBackup's own (timestamped), not other suites' fixtures.
const created = () => fs.readdirSync(BACKUPS_DIR).filter((f) => !before.has(f) && /^glou-backup-\d{4}-/.test(f));
const tick = () => new Promise((r) => setTimeout(r, 50));

let retention: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.DATABASE_URL = 'postgresql://glou:pw@db:5432/glou_db';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  runCreate.mockClear();
  retention = vi.spyOn(backupService, 'enforceRetention').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const f of created()) fs.rmSync(path.join(BACKUPS_DIR, f), { force: true });
});

afterAll(() => {
  for (const f of created()) fs.rmSync(path.join(BACKUPS_DIR, f), { force: true });
});

function recorded() {
  expect(runCreate).toHaveBeenCalledTimes(1);
  return (runCreate.mock.calls[0][0] as { data: { success: boolean; error?: string; filePath?: string; fileSizeBytes?: number } }).data;
}

describe('backupService.runBackup — failed dump (#182)', () => {
  it('removes the truncated file and records the failure', async () => {
    const dump = new FakeDump();
    spawnMock.mockReturnValue(dump);
    const run = backupService.runBackup('manual');
    // let the write stream open the file, then fail the dump half way
    await tick();
    // like a real child process: its output ends before 'close' is emitted
    dump.stdout.end('partial');
    dump.emit('close', 1);
    await run;

    expect(created()).toEqual([]);
    expect(recorded()).toEqual(expect.objectContaining({ success: false, error: expect.stringMatching(/^PG_DUMP_FAILED \(exit 1\)/) }));
    expect(retention).not.toHaveBeenCalled();
  });
});

describe('backupService.runBackup — success only once the file is complete (#670)', () => {
  it('waits for the file to be fully written after pg_dump exits, then records its final size', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    vi.spyOn(fs, 'createWriteStream').mockImplementation(
      fileStreamEndingWith((real, callback) => { void gate.then(() => real.end(callback)); }),
    );
    const dump = new FakeDump();
    spawnMock.mockReturnValue(dump);

    let settled = false;
    const run = backupService.runBackup('manual').then((r) => { settled = true; return r; });
    dump.stdout.end('CREATE TABLE t (id int);\n');
    dump.emit('close', 0);
    await tick();

    // pg_dump is done but the file is not: nothing may be recorded yet.
    expect(settled).toBe(false);
    expect(runCreate).not.toHaveBeenCalled();
    expect(retention).not.toHaveBeenCalled();

    release();
    await run;
    const data = recorded();
    expect(data.success).toBe(true);
    expect(data.fileSizeBytes).toBe(fs.statSync(data.filePath as string).size);
    expect(zlib.gunzipSync(fs.readFileSync(data.filePath as string)).toString()).toBe('CREATE TABLE t (id int);\n');
    expect(retention).toHaveBeenCalledTimes(1);
  });

  it('marks the run failed, deletes the partial file and skips retention when the last write fails', async () => {
    vi.spyOn(fs, 'createWriteStream').mockImplementation(
      fileStreamEndingWith((real, callback) => { real.end(() => callback(diskFull())); }),
    );
    const dump = new FakeDump();
    spawnMock.mockReturnValue(dump);

    const run = backupService.runBackup('manual');
    dump.stdout.end('CREATE TABLE t (id int);\n'.repeat(1000));
    dump.emit('close', 0); // pg_dump itself succeeded
    await run;

    expect(recorded()).toEqual(expect.objectContaining({ success: false, error: expect.stringMatching(/^WRITE_FAILED: ENOSPC/) }));
    expect(created()).toEqual([]);
    expect(retention).not.toHaveBeenCalled();
  });

  it('stops pg_dump and fails the run when the file cannot be written while it is still dumping', async () => {
    vi.spyOn(fs, 'createWriteStream').mockImplementation((() => new Writable({
      write(_chunk, _enc, callback) { callback(diskFull()); },
    })) as unknown as CreateWriteStream);
    const dump = new FakeDump();
    spawnMock.mockReturnValue(dump);

    const run = backupService.runBackup('manual');
    dump.stdout.write('CREATE TABLE t (id int);\n'.repeat(1000)); // pg_dump never exits on its own
    await run;

    expect(dump.kill).toHaveBeenCalled();
    expect(recorded()).toEqual(expect.objectContaining({ success: false, error: expect.stringMatching(/^WRITE_FAILED: ENOSPC/) }));
    expect(retention).not.toHaveBeenCalled();
  });
});

describe('backupService.runBackup — the file restores on PostgreSQL 15 (#665)', () => {
  const preamble = [
    '--',
    '-- PostgreSQL database dump',
    '--',
    '',
    '\\restrict abc123',
    '',
    'SET statement_timeout = 0;',
    'SET lock_timeout = 0;',
    'SET idle_in_transaction_session_timeout = 0;',
    'SET transaction_timeout = 0;',
    "SET client_encoding = 'UTF8';",
    "SELECT pg_catalog.set_config('search_path', '', false);",
    '',
  ].join('\n') + '\n';
  // Accented text (multi-byte UTF-8) on purpose, and a data row that happens to
  // look like the filtered statement: table data must never be touched.
  const body = [
    'CREATE TABLE public.note (body text);',
    'COPY public.note (body) FROM stdin;',
    'SET transaction_timeout is a PostgreSQL 17 setting',
    ...Array.from({ length: 2000 }, (_, i) => `Château Mouton-Rothschild, élevé en fût n°${i} — très équilibré`),
    '\\.',
    '',
  ].join('\n');

  it('writes no SET transaction_timeout line and leaves everything else byte for byte', async () => {
    const dump = new FakeDump();
    spawnMock.mockReturnValue(dump);

    const run = backupService.runBackup('manual');
    // Odd-sized chunks, so lines and multi-byte characters straddle chunk boundaries.
    const bytes = Buffer.from(preamble + body, 'utf8');
    for (let i = 0; i < bytes.length; i += 1001) dump.stdout.write(bytes.subarray(i, i + 1001));
    dump.stdout.end();
    dump.emit('close', 0);
    await run;

    const data = recorded();
    expect(data.success).toBe(true);
    const sql = zlib.gunzipSync(fs.readFileSync(data.filePath as string)).toString('utf8');
    expect(sql.match(/^SET transaction_timeout/gm)?.length).toBe(1); // only the data row
    expect(sql).toBe(preamble.replace('SET transaction_timeout = 0;\n', '') + body);
  });
});
