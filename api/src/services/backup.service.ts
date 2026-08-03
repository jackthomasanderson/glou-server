import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { prisma } from '../lib/prisma';
import { BackupRun } from '@prisma/client';
import { auditLog } from './audit.service';

// FEAT-18: Portabilité & Souveraineté des Données — Scheduled Backups.
// design.md "Sauvegarde & Migration": `pg_dump` planifié (cron quotidien),
// fichier horodaté HORS du volume Docker applicatif, rétention 7 jours
// glissants par défaut, dumps vérifiables.
//
// Format choice: `pg_dump --format=plain` streamed through Node's own
// `zlib.createGzip()` into the destination file, rather than
// `--format=custom` (which compresses natively in a single process) or a
// shell pipeline (`pg_dump | gzip > file`, which would require `shell: true`
// and reopen the exact shell-injection surface this service must avoid).
// `child_process.spawn` (no shell) gives streaming stdout, which is piped
// in-process through `zlib.createGzip()` — this keeps the requested
// `.sql.gz` naming/format (plain SQL, gzip-compressed, restorable with a
// plain `gunzip | psql`) while never invoking a shell.
export const BACKUPS_DIR = path.resolve(process.cwd(), 'backups');

const FILENAME_PREFIX = 'glou-backup-';
const FILENAME_SUFFIX = '.sql.gz';
const DAY_MS = 24 * 60 * 60 * 1000;

export type BackupTrigger = 'scheduled' | 'manual';

interface DbConnParams {
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
function parseDatabaseUrl(): DbConnParams {
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

function ensureBackupsDir(): void {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

/**
 * Directory-traversal guard, mirroring authService.deleteAvatar: only the
 * basename of the untrusted input is honored, then re-resolved strictly
 * inside BACKUPS_DIR, then the resolved path is verified to still be a
 * descendant of BACKUPS_DIR before any filesystem operation touches it.
 */
function resolveInsideBackupsDir(filePath: string): string {
  const filename = path.basename(filePath);
  const resolved = path.resolve(BACKUPS_DIR, filename);
  if (resolved !== BACKUPS_DIR && !resolved.startsWith(BACKUPS_DIR + path.sep)) {
    throw new Error('INVALID_PATH');
  }
  return resolved;
}

/**
 * Runs `pg_dump` via `spawn` (array argv, no shell — no string interpolation
 * of user/DB-supplied values is ever built into a command string) and pipes
 * its stdout through `zlib.createGzip()` straight into `destPath`. The
 * password is passed via the `PGPASSWORD` env var of the child process only,
 * never as a CLI argument (which would leak into `ps`/process listings).
 */
async function execPgDump(conn: DbConnParams, destPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
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

    const gzip = zlib.createGzip();
    const out = fs.createWriteStream(destPath);

    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    child.on('error', (err) => fail(new Error(`PG_DUMP_SPAWN_FAILED: ${err.message}`)));
    gzip.on('error', (err) => fail(new Error(`GZIP_FAILED: ${err.message}`)));
    out.on('error', (err) => fail(new Error(`WRITE_FAILED: ${err.message}`)));

    child.stdout.pipe(gzip).pipe(out);

    child.on('close', (code) => {
      if (settled) return;
      if (code === 0) {
        settled = true;
        resolve();
      } else {
        settled = true;
        reject(new Error(`PG_DUMP_FAILED (exit ${code}): ${stderr.trim() || 'unknown error'}`));
      }
    });
  });
}

/**
 * Restores a `.sql.gz` dump by streaming it through `zlib.createGunzip()`
 * into `psql`'s stdin — again `spawn` with array argv, no shell, password
 * via `PGPASSWORD`. `ON_ERROR_STOP=on` makes `psql` abort (non-zero exit) on
 * the first SQL error instead of silently continuing through a partially
 * broken restore.
 */
async function execPsqlRestore(conn: DbConnParams, srcPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const args = [
      '--host', conn.host,
      '--port', conn.port,
      '--username', conn.user,
      '--no-password',
      '--dbname', conn.database,
      '--set', 'ON_ERROR_STOP=on',
    ];
    const child = spawn('psql', args, {
      env: { ...process.env, PGPASSWORD: conn.password },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.stdout.on('data', () => { /* drain psql's stdout, we only care about exit code + stderr */ });

    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    child.on('error', (err) => fail(new Error(`PSQL_SPAWN_FAILED: ${err.message}`)));

    const src = fs.createReadStream(srcPath);
    const gunzip = zlib.createGunzip();
    src.on('error', (err) => fail(new Error(`READ_FAILED: ${err.message}`)));
    gunzip.on('error', (err) => fail(new Error(`GUNZIP_FAILED: ${err.message}`)));

    src.pipe(gunzip).pipe(child.stdin);

    child.on('close', (code) => {
      if (settled) return;
      if (code === 0) {
        settled = true;
        resolve();
      } else {
        settled = true;
        reject(new Error(`PSQL_RESTORE_FAILED (exit ${code}): ${stderr.trim() || 'unknown error'}`));
      }
    });
  });
}

export const backupService = {
  /**
   * Runs a `pg_dump`, applies retention, and always records a `BackupRun`
   * (success or failure) — never throws to the caller, matching
   * `MaintenanceService.runRetentionCleanup`'s contract so a failing
   * scheduled run can never crash the process.
   */
  async runBackup(trigger: BackupTrigger, triggeredBy?: string): Promise<BackupRun> {
    const startedAt = Date.now();

    try {
      ensureBackupsDir();
      const conn = parseDatabaseUrl();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${FILENAME_PREFIX}${timestamp}${FILENAME_SUFFIX}`;
      const destPath = path.join(BACKUPS_DIR, filename);

      await execPgDump(conn, destPath);
      const stats = fs.statSync(destPath);

      await this.enforceRetention();

      return await prisma.backupRun.create({
        data: {
          trigger,
          triggeredBy: triggeredBy ?? null,
          success: true,
          filePath: destPath,
          fileSizeBytes: stats.size,
          durationMs: Date.now() - startedAt,
        },
      });
    } catch (error) {
      console.error('[backup] Backup run failed:', error);
      const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      return prisma.backupRun.create({
        data: {
          trigger,
          triggeredBy: triggeredBy ?? null,
          success: false,
          error: message,
          durationMs: Date.now() - startedAt,
        },
      });
    }
  },

  /**
   * Called on every cron tick (see index.ts) — re-reads `SystemConfig` each
   * time so enabling/disabling or changing the hour takes effect without a
   * container restart. Only actually runs `pg_dump` when both `backupEnabled`
   * is true AND the current UTC hour matches `backupHourUtc`.
   */
  async runScheduledIfDue(): Promise<BackupRun | null> {
    const config = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
    if (!config?.backupEnabled) return null;
    const targetHour = config.backupHourUtc ?? 3;
    if (new Date().getUTCHours() !== targetHour) return null;
    return this.runBackup('scheduled');
  },

  /**
   * Deletes dump files older than `backupRetentionDays` (design.md: "7 jours
   * glissants" minimum). Only ever touches files matching the exact naming
   * convention this service produces, inside BACKUPS_DIR.
   */
  async enforceRetention(): Promise<void> {
    const config = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
    const retentionDays = config?.backupRetentionDays ?? 7;
    const cutoff = Date.now() - retentionDays * DAY_MS;

    let entries: string[];
    try {
      entries = fs.readdirSync(BACKUPS_DIR);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.startsWith(FILENAME_PREFIX) || !entry.endsWith(FILENAME_SUFFIX)) continue;
      const fullPath = path.join(BACKUPS_DIR, entry);
      try {
        const stats = fs.statSync(fullPath);
        if (stats.mtimeMs < cutoff) {
          fs.unlinkSync(fullPath);
        }
      } catch (err) {
        console.error(`[backup] Failed to evaluate/delete ${entry} during retention:`, err);
      }
    }
  },

  /**
   * DESTRUCTIVE: overwrites all current data with the dump's content.
   * `filePath` is treated as untrusted — only its basename is honored and
   * re-resolved inside BACKUPS_DIR (see resolveInsideBackupsDir), exactly
   * like authService.deleteAvatar's traversal guard. Always writes an
   * AuditLog entry (success or failure) before returning/throwing.
   */
  async restoreBackup(filePath: string, triggeredBy: string, ip: string): Promise<void> {
    const safePath = resolveInsideBackupsDir(filePath);
    if (!fs.existsSync(safePath)) throw new Error('BACKUP_FILE_NOT_FOUND');

    const conn = parseDatabaseUrl();
    try {
      await execPsqlRestore(conn, safePath);
      await auditLog({
        userId: triggeredBy,
        action: 'BACKUP_RESTORE',
        status: 'success',
        ip,
        details: { filePath: safePath },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      await auditLog({
        userId: triggeredBy,
        action: 'BACKUP_RESTORE',
        status: 'error',
        ip,
        details: { filePath: safePath, error: message },
      });
      throw error;
    }
  },

  /**
   * Resolves a successful BackupRun's file to an on-disk path safe to stream
   * back to the admin, applying the same traversal guard as restoreBackup.
   */
  async getDownloadTarget(id: string): Promise<{ path: string; filename: string }> {
    const run = await prisma.backupRun.findUnique({ where: { id } });
    if (!run || !run.success || !run.filePath) throw new Error('BACKUP_NOT_FOUND');
    const safePath = resolveInsideBackupsDir(run.filePath);
    if (!fs.existsSync(safePath)) throw new Error('BACKUP_FILE_MISSING');
    return { path: safePath, filename: path.basename(safePath) };
  },
};
