import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { BACKUPS_DIR, backupFileName, execPgDump, parseDatabaseUrl } from '../lib/pg-dump';

// design.md "Sauvegarde & Migration": before `prisma migrate deploy`, the
// API image's start command runs this step. When migrations are pending on a
// database that already holds data, it takes a backup with the scheduled
// backup's pg_dump, named glou-backup-before-migration-<timestamp>.sql.gz and
// kept out of retention: restoring it, with the previous image, is the only
// way back. If that backup fails, it exits non-zero and nothing is migrated.
//
// No Prisma client here: it is generated for the new schema while the
// database is still at the old one. Plain SQL through `pg` only, and no
// BackupRun row: the API lists the file in the backup history at startup
// (backupService.syncHistoryWithFiles).

/** The subset of a `pg` client this step needs, so tests can stub it. */
export interface Queryable {
  query<R extends Record<string, unknown>>(sql: string): Promise<{ rows: R[] }>;
}

export type MigrationState =
  | { kind: 'fresh' }
  | { kind: 'upToDate' }
  | { kind: 'pending'; pending: string[]; hasData: boolean };

/** Migration folders shipped with this image (prisma/migrations/<name>/migration.sql). */
export function listMigrationFolders(migrationsDir: string): string[] {
  return fs.readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(migrationsDir, entry.name, 'migration.sql')))
    .map((entry) => entry.name)
    .sort();
}

/**
 * Compares the shipped migrations with `_prisma_migrations`. A migration
 * counts as applied once it finished and was not rolled back, the way
 * `prisma migrate deploy` reads it; a failed one is pending (deploy will
 * refuse to go on, and a backup first costs nothing).
 */
export async function readMigrationState(db: Queryable, shipped: string[]): Promise<MigrationState> {
  const table = await db.query<{ exists: boolean }>(
    "SELECT to_regclass('_prisma_migrations') IS NOT NULL AS exists",
  );
  // A new installation: nothing to protect yet.
  if (!table.rows[0]?.exists) return { kind: 'fresh' };

  const applied = await db.query<{ migration_name: string }>(
    'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
  );
  const done = new Set(applied.rows.map((row) => row.migration_name));
  const pending = shipped.filter((name) => !done.has(name));
  if (!pending.length) return { kind: 'upToDate' };

  // At least one account means someone uses this instance. If the table is
  // missing, err on the side of a backup.
  const users = await db.query<{ has_data: boolean }>(
    `SELECT CASE WHEN to_regclass('"User"') IS NULL THEN true
                 ELSE EXISTS (SELECT 1 FROM "User") END AS has_data`,
  );
  return { kind: 'pending', pending, hasData: users.rows[0]?.has_data !== false };
}

function isDirWritable(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

const uid = () => process.getuid?.() ?? '?';

/** What the administrator reads in `docker compose logs api` when the backup cannot be taken. */
export function backupsDirNotWritableMessage(dir: string): string {
  return `[backup] Migrations are pending, but ${dir} is not writable by this process (uid ${uid()}), `
    + 'so the backup taken before migrating could not be written. Nothing was migrated and Glou did not start. '
    + 'Most likely the backups folder next to docker-compose.yml belongs to root (Docker creates it so on Linux). '
    + 'On the host, in your Glou folder, run: mkdir -p backups && sudo chown 1001:1001 backups, '
    + 'then: docker compose up -d';
}

export function dumpFailedMessage(error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return `[backup] Migrations are pending, but the backup taken before migrating failed: ${reason}. `
    + 'Nothing was migrated and Glou did not start. '
    + 'If the reason mentions a permission or a read-only file system, run on the host, in your Glou folder: '
    + 'sudo chown 1001:1001 backups. If it mentions no space left, free disk space. '
    + 'Then: docker compose up -d';
}

export interface PreMigrateDeps {
  connect: () => Promise<Queryable & { end: () => Promise<void> }>;
  migrationsDir: string;
  backupsDir: string;
  dump: (destPath: string) => Promise<void>;
  now: () => Date;
  log: (line: string) => void;
  error: (line: string) => void;
}

/** Runs the step. Returns the process exit code: 0 lets the migrations run, 1 stops the start. */
export async function preMigrate(deps: PreMigrateDeps): Promise<number> {
  let state: MigrationState;
  try {
    const shipped = listMigrationFolders(deps.migrationsDir);
    const db = await deps.connect();
    try {
      state = await readMigrationState(db, shipped);
    } finally {
      await db.end().catch(() => undefined);
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    deps.error(`[backup] Could not check for pending migrations: ${reason}. Nothing was migrated. `
      + 'If the database was still starting, run: docker compose restart api');
    return 1;
  }

  if (state.kind === 'fresh') {
    deps.log('[backup] New database: no backup needed before migrating.');
    return 0;
  }
  if (state.kind === 'upToDate') {
    deps.log('[backup] No pending migration: no backup needed.');
    return 0;
  }
  if (!state.hasData) {
    deps.log(`[backup] ${state.pending.length} pending migration(s) on a database with no account yet: no backup needed.`);
    return 0;
  }

  deps.log(`[backup] ${state.pending.length} pending migration(s) (${state.pending.join(', ')}): backing up the database first.`);
  if (!isDirWritable(deps.backupsDir)) {
    deps.error(backupsDirNotWritableMessage(deps.backupsDir));
    return 1;
  }

  const destPath = path.join(deps.backupsDir, backupFileName(deps.now(), { beforeMigration: true }));
  try {
    await deps.dump(destPath);
  } catch (err) {
    // A failed pg_dump leaves a truncated file that would pass for a backup.
    fs.rmSync(destPath, { force: true });
    deps.error(dumpFailedMessage(err));
    return 1;
  }
  const size = fs.statSync(destPath).size;
  deps.log(`[backup] Backup taken before migrating: ${destPath} (${size} bytes). `
    + 'It is kept until you delete it (not subject to retention); restore it with the previous image to go back.');
  return 0;
}

/* c8 ignore start */
if (require.main === module) {
  void preMigrate({
    connect: async () => {
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      return client as unknown as Queryable & { end: () => Promise<void> };
    },
    migrationsDir: path.resolve(process.cwd(), 'prisma', 'migrations'),
    backupsDir: BACKUPS_DIR,
    dump: (destPath) => execPgDump(parseDatabaseUrl(), destPath),
    now: () => new Date(),
    log: (line) => console.info(line),
    error: (line) => console.error(line),
  }).then((code) => {
    process.exitCode = code;
  });
}
/* c8 ignore stop */
