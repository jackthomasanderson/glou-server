import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { Transform, Writable } from 'stream';
import { pipeline } from 'stream/promises';

// The pg_dump half of the backups (FEAT-18), without any Prisma import: the
// pre-migration step (scripts/pre-migrate.ts) runs it before
// `prisma migrate deploy`, when the generated client already describes the
// new schema while the database is still at the old one.
//
// Format choice: `pg_dump --format=plain` streamed through Node's own
// `zlib.createGzip()` into the destination file, rather than
// `--format=custom` (which compresses natively in a single process) or a
// shell pipeline (`pg_dump | gzip > file`, which would require `shell: true`
// and reopen the exact shell-injection surface this service must avoid).
// `child_process.spawn` (no shell) gives streaming stdout, which is piped
// in-process through `zlib.createGzip()` — this keeps the requested
// `.sql.gz` naming/format (plain SQL, gzip-compressed) while never invoking
// a shell. The dump is filtered on the way (see
// filterUnsupportedSetStatements) so the file restores with the plain
// `gunzip | psql` of the disaster-recovery guide (wiki page 30).
export const BACKUPS_DIR = path.resolve(process.cwd(), 'backups');

const FILENAME_PREFIX = 'glou-backup-';
const FILENAME_SUFFIX = '.sql.gz';
/** The file timestamp: an ISO date with `:` and `.` turned into `-`. */
const FILENAME_TIMESTAMP = /^glou-backup-(?:before-migration-)?(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.sql\.gz$/;

const BEFORE_MIGRATION_MARKER = '-before-migration-';

/**
 * Name of a new backup file. The one taken before migrating (design.md
 * "Sauvegarde & Migration") is the only way back to the previous version:
 * its name says so, and retention never deletes it.
 */
export function backupFileName(date: Date, options: { beforeMigration?: boolean } = {}): string {
  const timestamp = date.toISOString().replace(/[:.]/g, '-');
  return `${FILENAME_PREFIX}${options.beforeMigration ? 'before-migration-' : ''}${timestamp}${FILENAME_SUFFIX}`;
}

/** A backup taken before a migration: kept until the administrator deletes it. */
export function isBeforeMigrationBackup(name: string): boolean {
  return isBackupFileName(name) && name.includes(BEFORE_MIGRATION_MARKER);
}

export interface DbConnParams {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

/**
 * `DATABASE_URL` is a standard `postgresql://user:pass@host:port/db` DSN —
 * `URL` parses it natively without any custom string splitting.
 */
export function parseDatabaseUrl(): DbConnParams {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL_NOT_SET');
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: url.port || '5432',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
  };
}

export function isBackupFileName(name: string): boolean {
  return name.startsWith(FILENAME_PREFIX) && name.endsWith(FILENAME_SUFFIX);
}

/** When a backup file was taken: from its name when Glou wrote it, else from the file itself. */
export function backupFileDate(name: string, stats: fs.Stats): Date {
  const m = FILENAME_TIMESTAMP.exec(name);
  if (m) {
    const date = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return stats.mtime;
}

/**
 * Reads a `.sql.gz` to its end without keeping it in memory: false when it is
 * truncated or not gzip at all (e.g. left behind by a pg_dump killed mid-way).
 */
export async function isCompleteGzip(filePath: string): Promise<boolean> {
  try {
    await pipeline(
      fs.createReadStream(filePath),
      zlib.createGunzip(),
      new Writable({ write(_chunk, _enc, callback) { callback(); } }),
    );
    return true;
  } catch {
    return false;
  }
}

export function ensureBackupsDir(): void {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

/** A hung `pg_dump`/`psql` (DB lock, full disk returning no error) must not
 * leave the backup/restore promise pending forever: kill the child and
 * settle with a clear error instead. */
export const CHILD_PROCESS_TIMEOUT_MS = 30 * 60 * 1000;

// api/Dockerfile installs Alpine's rolling postgresql-client package, so
// pg_dump can be newer than the postgres:15-alpine server it dumps from —
// the officially supported direction. But a newer pg_dump's preamble can
// `SET` a GUC the older server predates (e.g. `transaction_timeout`, added
// in PostgreSQL 17): restoring would abort on it under `ON_ERROR_STOP=on`,
// rolling back the whole single-transaction restore. Filtering such a line
// out is safe — it's a session-scoped setting for the dump/restore session,
// never data or schema — so a dump stays restorable across the server
// versions this image's pg_dump may legitimately run ahead of. Applied when
// the dump is written (#665), so every new file restores with a plain
// `gunzip | psql`, and again at restore time for files written before that.
const UNSUPPORTED_RESTORE_SET_STATEMENTS = /^SET transaction_timeout\b/i;

/** Lines of the session preamble pg_dump writes before the first object. */
const DUMP_PREAMBLE_LINE = /^(--|SET |SELECT |\\|$)/;

/**
 * Drops the unsupported `SET` lines from the dump's preamble only: once the
 * first object definition starts, chunks pass through untouched, so table
 * data can never be altered. Decoded as latin1, which maps every byte to one
 * character and back, so a multi-byte UTF-8 character split across two
 * chunks survives intact.
 */
export function filterUnsupportedSetStatements(): Transform {
  let carry = '';
  let inPreamble = true;
  return new Transform({
    transform(chunk: Buffer, _enc, callback) {
      if (!inPreamble) {
        callback(null, chunk);
        return;
      }
      carry += chunk.toString('latin1');
      const lines = carry.split('\n');
      carry = lines.pop() ?? '';
      const kept: string[] = [];
      for (const line of lines) {
        if (inPreamble && !DUMP_PREAMBLE_LINE.test(line)) inPreamble = false;
        if (inPreamble && UNSUPPORTED_RESTORE_SET_STATEMENTS.test(line)) continue;
        kept.push(line);
      }
      let out = kept.length ? kept.join('\n') + '\n' : '';
      if (!inPreamble) {
        out += carry;
        carry = '';
      }
      callback(null, Buffer.from(out, 'latin1'));
    },
    flush(callback) {
      if (carry && !(inPreamble && UNSUPPORTED_RESTORE_SET_STATEMENTS.test(carry))) {
        this.push(Buffer.from(carry, 'latin1'));
      }
      callback();
    },
  });
}

/**
 * Runs `pg_dump` via `spawn` (array argv, no shell — no string interpolation
 * of user/DB-supplied values is ever built into a command string) and pipes
 * its stdout through the SET filter and `zlib.createGzip()` straight into
 * `destPath`. The password is passed via the `PGPASSWORD` env var of the
 * child process only, never as a CLI argument (which would leak into
 * `ps`/process listings).
 *
 * Resolves only once BOTH pg_dump has exited with code 0 AND the file has
 * been completely written, flushed to disk and closed (#670): a write error
 * at the very end (full disk) must fail the backup, not surface after it was
 * recorded as successful.
 */
export async function execPgDump(conn: DbConnParams, destPath: string): Promise<void> {
  const args = [
    '--host', conn.host,
    '--port', conn.port,
    '--username', conn.user,
    '--no-password',
    '--format', 'plain',
    '--dbname', conn.database,
  ];
  const child = spawn('pg_dump', args, {
    env: { ...process.env, PGPASSWORD: conn.password },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

  let spawnFailed = false;
  const exited = new Promise<void>((resolve, reject) => {
    child.on('error', (err) => {
      spawnFailed = true;
      reject(new Error(`PG_DUMP_SPAWN_FAILED: ${err.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`PG_DUMP_FAILED (exit ${code}): ${stderr.trim() || 'unknown error'}`));
    });
  });

  const filter = filterUnsupportedSetStatements();
  const gzip = zlib.createGzip();
  // `flush`: fsync before closing, so a late disk error fails the pipeline.
  const out = fs.createWriteStream(destPath, { flush: true });

  // The pipeline hands its first error to every stream it tears down: the
  // first stream to report it is the one that actually failed.
  let failedStage: string | undefined;
  const failedAt = (stage: string) => () => { failedStage ??= stage; };
  child.stdout.on('error', failedAt('PG_DUMP_OUTPUT_FAILED'));
  filter.on('error', failedAt('FILTER_FAILED'));
  gzip.on('error', failedAt('GZIP_FAILED'));
  out.on('error', failedAt('WRITE_FAILED'));

  const written = pipeline(child.stdout, filter, gzip, out).catch((err: Error) => {
    // Nothing reads pg_dump's output any more: stop it rather than let it hang.
    child.kill('SIGKILL');
    throw new Error(`${failedStage ?? 'DUMP_STREAM_FAILED'}: ${err.message}`);
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`PG_DUMP_TIMED_OUT after ${CHILD_PROCESS_TIMEOUT_MS / 1000}s`));
    }, CHILD_PROCESS_TIMEOUT_MS);
  });

  try {
    const [dump, write] = await Promise.race([Promise.allSettled([exited, written]), timedOut]);
    // pg_dump could not even start: that is the cause, whatever the file says.
    if (dump.status === 'rejected' && spawnFailed) throw dump.reason;
    // A stream failure kills pg_dump, so its own exit error is only a consequence.
    if (write.status === 'rejected') throw write.reason;
    if (dump.status === 'rejected') throw dump.reason;
  } finally {
    clearTimeout(timer);
  }
}
