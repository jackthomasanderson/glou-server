import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { Writable } from 'stream';
import { pipeline } from 'stream/promises';
import { prisma } from '../lib/prisma';
import { BackupRun, Prisma } from '@prisma/client';
import { auditLog } from './audit.service';
import { notificationService } from './notification.service';
import { isNotifEn } from '../lib/notif-lang';
import { escapeHtml } from '../lib/html';
import { BACKUPS_DIR, CHILD_PROCESS_TIMEOUT_MS, DbConnParams, backupFileDate, backupFileName, ensureBackupsDir, execPgDump, filterUnsupportedSetStatements, isBackupFileName, isBeforeMigrationBackup, parseDatabaseUrl } from '../lib/pg-dump';

export { BACKUPS_DIR };

// FEAT-18: Portabilité & Souveraineté des Données — Scheduled Backups.
// design.md "Sauvegarde & Migration": `pg_dump` planifié (cron quotidien),
// fichier horodaté HORS du volume Docker applicatif, rétention 7 jours
// glissants par défaut, dumps vérifiables. The pg_dump itself lives in
// lib/pg-dump.ts, free of Prisma, for the pre-migration step (FEAT-94).
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * A backup is overdue once the last successful one is older than a day plus a
 * margin: a normal daily run is ~24 h apart and must not trip it, a run missed
 * because the container was stopped at the configured hour must (#234).
 */
const OVERDUE_AFTER_MS = 25 * 60 * 60 * 1000;

/** Which backup failed: the alert must not call a manual one "scheduled" (#666). */
type BackupFailureKind = 'scheduled' | 'manual' | 'beforeRestore';

const BACKUP_FAILURE_TEXT: Record<BackupFailureKind, Record<'en' | 'fr', { what: string; follow: string }>> = {
  scheduled: {
    en: { what: 'The scheduled database backup failed:', follow: 'No new backup is being produced. ' },
    fr: { what: 'La sauvegarde planifiée de la base a échoué :', follow: "Aucune nouvelle sauvegarde n'est produite. " },
  },
  manual: {
    en: { what: 'A database backup started from the admin panel failed:', follow: '' },
    fr: { what: "Une sauvegarde de la base lancée depuis l'administration a échoué :", follow: '' },
  },
  beforeRestore: {
    en: { what: 'The backup of the current data taken before a restore failed:', follow: 'The restore was cancelled; nothing was changed. ' },
    fr: { what: 'La sauvegarde des données actuelles prise avant une restauration a échoué :', follow: "La restauration a été annulée ; rien n'a été modifié. " },
  },
};

/**
 * Tells the administrators that backups are failing (#234). Before this, a failed
 * run was visible only in the container logs and in a history table nobody opens,
 * so a full disk could go unnoticed until the retention window had erased the
 * last good dump. Throttled: one message per failure streak, not one per hourly
 * retry.
 */
async function notifyAdminsOfBackupFailure(error: string, kind: BackupFailureKind): Promise<void> {
  try {
    const admins = await prisma.user.findMany({ where: { isAdmin: true, isActive: true }, select: { id: true, language: true, notifLanguage: true } });
    await Promise.all(admins.map((admin) => {
      const en = isNotifEn(admin);
      const subject = en ? 'Glou — database backup failed' : 'Glou — échec de la sauvegarde de la base';
      const { what, follow } = BACKUP_FAILURE_TEXT[kind][en ? 'en' : 'fr'];
      const htmlBody = en
        ? `<p>${what}</p><pre>${escapeHtml(error)}</pre><p>${follow}Check the disk space and the API logs, then use <b>Run now</b> in Admin → System Configuration → Backups.</p>`
        : `<p>${what}</p><pre>${escapeHtml(error)}</pre><p>${follow}Vérifiez l'espace disque et les logs de l'API, puis utilisez <b>Exécuter maintenant</b> dans Admin → Configuration système → Sauvegardes.</p>`;
      return notificationService.send({ userId: admin.id, category: 'backup', subject, htmlBody, bypassQuietHours: true });
    }));
  } catch (err) {
    // Never let the alert path break the backup bookkeeping.
    console.error('[backup] Could not notify administrators of the failure:', err);
  }
}

export type BackupTrigger = 'scheduled' | 'manual';

export interface RunBackupOptions {
  /**
   * The safety copy taken before a restore: no retention afterwards (it could
   * delete the very file about to be restored), and named as such in the
   * failure alert.
   */
  beforeRestore?: boolean;
}

/** Files runBackup is still writing: not listed by syncHistoryWithFiles. */
const backupsInProgress = new Set<string>();

/**
 * pg_dump and the restore must never run at the same time (a dump taken
 * mid-restore, two restores interleaved): runBackup and the restore itself
 * queue on this in-process lock.
 */
let backupLockTail: Promise<void> | null = null;
function withBackupLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = backupLockTail;
  // Free: start right away, exactly as without the lock.
  const run = previous ? previous.then(task) : task();
  const tail = run.then(() => undefined, () => undefined);
  backupLockTail = tail;
  void tail.then(() => { if (backupLockTail === tail) backupLockTail = null; });
  return run;
}

/**
 * Reads a `.sql.gz` to its end without keeping it in memory: false when it is
 * truncated or not gzip at all (e.g. left behind by a pg_dump killed mid-way).
 */
async function isCompleteGzip(filePath: string): Promise<boolean> {
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
 * The dump only holds `CREATE ...` statements (plain `pg_dump`, no `--clean`),
 * so replaying it on top of the live schema fails at the first object that
 * already exists (`type "AccessMode" already exists`, #232). The restore
 * therefore starts from an empty `public` schema; the dump recreates every
 * table, enum and the `_prisma_migrations` history from scratch.
 */
const RESET_SCHEMA_SQL = 'DROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\n';


/**
 * Restores a `.sql.gz` dump by streaming it through `zlib.createGunzip()`
 * into `psql`'s stdin — again `spawn` with array argv, no shell, password
 * via `PGPASSWORD`. The schema reset and the dump run in ONE transaction
 * (`--single-transaction`): `ON_ERROR_STOP=on` aborts on the first SQL error
 * and the whole thing rolls back, so a bad or truncated dump leaves the
 * current data untouched instead of a half-restored (or empty) database.
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
      '--single-transaction',
      '--file', '-',
    ];
    const child = spawn('psql', args, {
      env: { ...process.env, PGPASSWORD: conn.password },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.stdout.on('data', () => { /* drain psql's stdout, we only care about exit code + stderr */ });

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`PSQL_RESTORE_TIMED_OUT after ${CHILD_PROCESS_TIMEOUT_MS / 1000}s`));
    }, CHILD_PROCESS_TIMEOUT_MS);
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // A broken dump stream must not leave psql waiting on stdin inside an
      // open transaction (it would hold its locks and freeze the app): killing
      // it drops the connection and Postgres rolls the transaction back.
      child.kill('SIGKILL');
      reject(err);
    };

    child.on('error', (err) => fail(new Error(`PSQL_SPAWN_FAILED: ${err.message}`)));

    const src = fs.createReadStream(srcPath);
    const gunzip = zlib.createGunzip();
    const filter = filterUnsupportedSetStatements();
    src.on('error', (err) => fail(new Error(`READ_FAILED: ${err.message}`)));
    gunzip.on('error', (err) => fail(new Error(`GUNZIP_FAILED: ${err.message}`)));
    filter.on('error', (err) => fail(new Error(`FILTER_FAILED: ${err.message}`)));

    child.stdin.on('error', () => { /* psql exited early: its exit code + stderr are reported on 'close' */ });
    child.stdin.write(RESET_SCHEMA_SQL);
    src.pipe(gunzip).pipe(filter).pipe(child.stdin);

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`PSQL_RESTORE_FAILED (exit ${code}): ${stderr.trim() || 'unknown error'}`));
      }
    });
  });
}

export const backupService = {
  /**
   * #537: with the shipped compose file, Docker on Linux creates a missing
   * `./backups` bind-mount source as root, and this process (uid 1001)
   * cannot write to it — every scheduled backup would then fail silently
   * until someone opens the Backups tab. Checked at startup (logged) and
   * exposed to the admin UI.
   */
  isBackupsDirWritable(): boolean {
    try {
      ensureBackupsDir();
      fs.accessSync(BACKUPS_DIR, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Runs a `pg_dump`, applies retention, and always records a `BackupRun`
   * (success or failure) — never throws to the caller, matching
   * `MaintenanceService.runRetentionCleanup`'s contract so a failing
   * scheduled run can never crash the process.
   */
  runBackup(trigger: BackupTrigger, userId?: string, options: RunBackupOptions = {}): Promise<BackupRun> {
    return withBackupLock(() => this.runBackupUnlocked(trigger, userId, options));
  },

  /** runBackup's work, for a caller already holding the backup lock. */
  async runBackupUnlocked(trigger: BackupTrigger, userId: string | undefined, options: RunBackupOptions): Promise<BackupRun> {
    const { beforeRestore = false } = options;
    const startedAt = Date.now();
    let destPath: string | undefined;
    let filename: string | undefined;

    try {
      ensureBackupsDir();
      const conn = parseDatabaseUrl();
      filename = backupFileName(new Date());
      destPath = path.join(BACKUPS_DIR, filename);
      backupsInProgress.add(filename);

      await execPgDump(conn, destPath);
      const stats = fs.statSync(destPath);

      if (!beforeRestore) await this.enforceRetention();

      return await prisma.backupRun.create({
        data: {
          trigger,
          userId: userId ?? null,
          success: true,
          filePath: destPath,
          fileSizeBytes: stats.size,
          durationMs: Date.now() - startedAt,
        },
      });
    } catch (error) {
      console.error('[backup] Backup run failed:', error);
      // pg_dump creates the file before it finishes: a failed run leaves a
      // truncated dump that looks like a valid backup (#182).
      if (destPath) fs.rmSync(destPath, { force: true });
      const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      // Read the previous run BEFORE recording this failure, to tell a new
      // failure streak from the hourly retry of an already reported one.
      const previous = await prisma.backupRun.findFirst({ orderBy: { runAt: 'desc' } });
      const run = await prisma.backupRun.create({
        data: {
          trigger,
          userId: userId ?? null,
          success: false,
          error: message,
          durationMs: Date.now() - startedAt,
        },
      });
      const alreadyReported = previous && !previous.success && Date.now() - previous.runAt.getTime() < DAY_MS;
      if (!alreadyReported) await notifyAdminsOfBackupFailure(message, beforeRestore ? 'beforeRestore' : trigger);
      return run;
    } finally {
      if (filename) backupsInProgress.delete(filename);
    }
  },

  /**
   * Called on every cron tick (see index.ts) — re-reads `SystemConfig` each
   * time so enabling/disabling or changing the hour takes effect without a
   * container restart. Only actually runs `pg_dump` when both `backupEnabled`
   * is true AND the current UTC hour matches `backupHourUtc`.
   */
  async runScheduledIfDue(): Promise<BackupRun | null> {
    // The row is otherwise only created when an admin first opens the settings:
    // on a fresh install nobody has, and without it no backup would ever run (#233).
    const config = await prisma.systemConfig.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    });
    if (!config.backupEnabled) return null;
    const targetHour = config.backupHourUtc ?? 3;
    const atScheduledHour = new Date().getUTCHours() === targetHour;
    if (!atScheduledHour) {
      // Catch-up (#234): the hourly tick used to compare the hour only, so a
      // container stopped or restarting at the configured hour skipped that
      // day's backup with no trace. Run it at the next tick instead.
      const lastOk = await prisma.backupRun.findFirst({ where: { success: true }, orderBy: { runAt: 'desc' } });
      const overdue = !lastOk || Date.now() - lastOk.runAt.getTime() > OVERDUE_AFTER_MS;
      if (!overdue) return null;
    }
    return this.runBackup('scheduled');
  },

  /**
   * Deletes dump files older than `backupRetentionDays` (design.md: "7 jours
   * glissants" minimum). Only ever touches files matching the exact naming
   * convention this service produces, inside BACKUPS_DIR. The backup taken
   * before a migration is never deleted (design.md "Sauvegarde & Migration"):
   * it is the only way back to the previous version, and the administrator
   * removes it once the update is trusted.
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
      if (!isBackupFileName(entry) || isBeforeMigrationBackup(entry)) continue;
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
   *
   * #666: a backup of the current state is taken first, and the restore is
   * refused (BACKUP_BEFORE_RESTORE_FAILED) if it fails, so picking the wrong
   * file can always be undone. The backup history lives in the database the
   * dump replaces: it is carried over the restore and resynchronised with the
   * backups folder, so the newer backups and the safety copy stay listed.
   */
  async restoreBackup(filePath: string, userId: string, ip: string): Promise<{ safetyBackupRunId: string }> {
    const safePath = resolveInsideBackupsDir(filePath);
    if (!fs.existsSync(safePath)) throw new Error('BACKUP_FILE_NOT_FOUND');

    const conn = parseDatabaseUrl();
    let safetyBackupRunId: string | undefined;
    try {
      // Safety copy and restore under one lock: no other backup or restore in between.
      safetyBackupRunId = await withBackupLock(async () => {
        const safetyCopy = await this.runBackupUnlocked('manual', userId, { beforeRestore: true });
        if (!safetyCopy.success) throw new Error('BACKUP_BEFORE_RESTORE_FAILED');
        safetyBackupRunId = safetyCopy.id;

        const history = await prisma.backupRun.findMany();
        await execPsqlRestore(conn, safePath);
        await this.carryOverHistory(history);
        return safetyCopy.id;
      });

      await auditLog({
        userId,
        action: 'BACKUP_RESTORE',
        status: 'success',
        ip,
        details: { filePath: safePath, safetyBackupRunId },
      });
      return { safetyBackupRunId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      await auditLog({
        userId,
        action: 'BACKUP_RESTORE',
        status: 'error',
        ip,
        details: { filePath: safePath, error: message, safetyBackupRunId },
      });
      throw error;
    }
  },

  /**
   * After a restore, the `backup_runs` table is the one from the dump: puts
   * back the rows it predates (the restored backup's own row is written after
   * its dump, every later run is missing). The data is restored by then, so a
   * failure here is logged, not reported as a failed restore.
   */
  async carryOverHistory(history: BackupRun[]): Promise<void> {
    try {
      if (history.length) await prisma.backupRun.createMany({ data: history, skipDuplicates: true });
    } catch (err) {
      console.error('[backup] Could not restore the backup history after a restore:', err);
    }
    // Separately: even if the rows could not be written back (e.g. an older
    // backup_runs schema), the files, safety copy included, get listed.
    try {
      await this.syncHistoryWithFiles();
    } catch (err) {
      console.error('[backup] Could not resync the backup history with the backups folder:', err);
    }
  },

  /**
   * Lists in the history every backup file of BACKUPS_DIR it does not know
   * about (#666): a file copied there by hand, e.g. to recover on a new
   * machine, or one whose row was lost. Its date comes from its name, its size
   * from the disk. Called at startup and after every restore. A file still
   * being written, or truncated (a pg_dump killed mid-way), is not listed: it
   * would pass for the latest good backup and hold back the catch-up run.
   */
  async syncHistoryWithFiles(): Promise<number> {
    let entries: string[];
    try {
      entries = fs.readdirSync(BACKUPS_DIR).filter(isBackupFileName);
    } catch {
      return 0;
    }
    if (!entries.length) return 0;

    const known = await prisma.backupRun.findMany({
      where: { success: true, filePath: { not: null } },
      select: { filePath: true },
    });
    const knownNames = new Set(known.map((run) => path.basename(run.filePath ?? '')));

    const missing: Prisma.BackupRunCreateManyInput[] = [];
    for (const name of entries) {
      if (knownNames.has(name) || backupsInProgress.has(name)) continue;
      const fullPath = path.join(BACKUPS_DIR, name);
      try {
        const stats = fs.statSync(fullPath);
        if (!stats.isFile() || stats.size === 0) continue;
        if (!(await isCompleteGzip(fullPath))) {
          console.error(`[backup] ${name} is truncated or not a gzip file: not listed in the backup history`);
          continue;
        }
        missing.push({
          // Who took it is unknown: listed as a manual backup with no user.
          trigger: 'manual',
          userId: null,
          success: true,
          filePath: fullPath,
          fileSizeBytes: stats.size,
          runAt: backupFileDate(name, stats),
        });
      } catch (err) {
        console.error(`[backup] Could not read ${name} while listing the backups folder:`, err);
      }
    }
    if (missing.length) await prisma.backupRun.createMany({ data: missing });
    return missing.length;
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
