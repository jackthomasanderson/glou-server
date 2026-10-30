import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import {
  preMigrate,
  readMigrationState,
  listMigrationFolders,
  type PreMigrateDeps,
  type Queryable,
} from '../../src/scripts/pre-migrate';

// FEAT-94 / design.md "Sauvegarde & Migration": before `prisma migrate
// deploy`, the API image backs the database up when migrations are pending
// on an instance in use, and refuses to start if that backup fails.

/** A stubbed database: which tables exist, which migrations are applied, whether an account exists. */
function fakeDb(opts: {
  migrationsTable?: boolean; applied?: string[]; userTable?: boolean; hasUser?: boolean;
  /** backup_runs: undefined = no table; else the file paths it lists. */
  backupRuns?: string[];
  /** Latest finished_at / rolled_back_at in _prisma_migrations. */
  lastMigrationChange?: Date | null;
  /** started_at of the failed rows (finished_at and rolled_back_at NULL) in _prisma_migrations. */
  failedStartedAt?: Date[];
}) {
  const {
    migrationsTable = true, applied = [], userTable = true, hasUser = true,
    backupRuns, lastMigrationChange = new Date('2026-10-01T00:00:00Z'), failedStartedAt = [],
  } = opts;
  const queries: string[] = [];
  const db: Queryable & { end: () => Promise<void> } = {
    async query<R extends Record<string, unknown>>(sql: string) {
      queries.push(sql);
      if (sql.includes("to_regclass('_prisma_migrations')")) return { rows: [{ exists: migrationsTable }] as unknown as R[] };
      if (sql.includes("to_regclass('backup_runs')")) return { rows: [{ exists: backupRuns !== undefined }] as unknown as R[] };
      if (sql.includes('FROM backup_runs')) return { rows: (backupRuns ?? []).map((filePath) => ({ filePath })) as unknown as R[] };
      if (sql.includes('WHERE finished_at IS NULL AND rolled_back_at IS NULL')) {
        return { rows: failedStartedAt.map((started_at) => ({ started_at })) as unknown as R[] };
      }
      if (sql.includes('max(GREATEST(finished_at, rolled_back_at))')) return { rows: [{ last: lastMigrationChange }] as unknown as R[] };
      if (sql.includes('FROM _prisma_migrations')) {
        // A failed (unfinished) or rolled-back row is excluded by the query itself.
        expect(sql).toMatch(/finished_at IS NOT NULL/);
        expect(sql).toMatch(/rolled_back_at IS NULL/);
        return { rows: applied.map((migration_name) => ({ migration_name })) as unknown as R[] };
      }
      if (sql.includes('"User"')) return { rows: [{ has_data: !userTable || hasUser }] as unknown as R[] };
      throw new Error(`unexpected query: ${sql}`);
    },
    end: vi.fn(async () => undefined),
  };
  return { db, queries };
}

let tmp: string;
let migrationsDir: string;
let backupsDir: string;
const SHIPPED = ['20260307000000_init', '20260308000000_second', '20261101000000_third'];
const NOW = new Date('2026-11-01T08:30:00.123Z');
const EXPECTED_NAME = 'glou-backup-before-migration-2026-11-01T08-30-00-123Z.sql.gz';

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'glou-pre-migrate-'));
  migrationsDir = path.join(tmp, 'migrations');
  backupsDir = path.join(tmp, 'backups');
  for (const name of SHIPPED) {
    fs.mkdirSync(path.join(migrationsDir, name), { recursive: true });
    fs.writeFileSync(path.join(migrationsDir, name, 'migration.sql'), '-- sql');
  }
  fs.writeFileSync(path.join(migrationsDir, 'migration_lock.toml'), 'provider = "postgresql"');
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function deps(db: ReturnType<typeof fakeDb>['db'], overrides: Partial<PreMigrateDeps> = {}) {
  const logs: string[] = [];
  const errors: string[] = [];
  const dump = vi.fn(async (dest: string) => { fs.writeFileSync(dest, zlib.gzipSync('-- dump')); });
  const d: PreMigrateDeps = {
    connect: async () => db,
    migrationsDir,
    backupsDir,
    dump,
    now: () => NOW,
    log: (l) => logs.push(l),
    error: (l) => errors.push(l),
    ...overrides,
  };
  return { d, logs, errors, dump: (overrides.dump as typeof dump | undefined) ?? dump };
}

const backupFiles = () => (fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir) : []);

describe('listMigrationFolders', () => {
  it('lists only the migration folders, sorted, not migration_lock.toml', () => {
    fs.mkdirSync(path.join(migrationsDir, 'not-a-migration'));
    expect(listMigrationFolders(migrationsDir)).toEqual(SHIPPED);
  });
});

describe('readMigrationState', () => {
  it('a new database (no _prisma_migrations table) is "fresh"', async () => {
    const { db, queries } = fakeDb({ migrationsTable: false });
    expect(await readMigrationState(db, SHIPPED)).toEqual({ kind: 'fresh' });
    expect(queries).toHaveLength(1);
  });

  it('every shipped migration applied: up to date', async () => {
    const { db } = fakeDb({ applied: SHIPPED });
    expect(await readMigrationState(db, SHIPPED)).toEqual({ kind: 'upToDate' });
  });

  it('a database behind the image: lists the pending migrations', async () => {
    const { db } = fakeDb({ applied: SHIPPED.slice(0, 1) });
    expect(await readMigrationState(db, SHIPPED)).toEqual({
      kind: 'pending',
      pending: SHIPPED.slice(1),
      hasData: true,
    });
  });

  it('a migration that failed (not finished) is still pending', async () => {
    const { db } = fakeDb({ applied: SHIPPED.slice(0, 2) });
    const state = await readMigrationState(db, SHIPPED);
    expect(state).toMatchObject({ kind: 'pending', pending: [SHIPPED[2]] });
  });

  it('pending migrations but no account yet: no data to protect', async () => {
    const { db } = fakeDb({ applied: SHIPPED.slice(0, 1), hasUser: false });
    expect(await readMigrationState(db, SHIPPED)).toMatchObject({ kind: 'pending', hasData: false });
  });

  it('no "User" table: assumes there is data (backs up rather than risk it)', async () => {
    const { db } = fakeDb({ applied: SHIPPED.slice(0, 1), userTable: false });
    expect(await readMigrationState(db, SHIPPED)).toMatchObject({ kind: 'pending', hasData: true });
  });
});

describe('preMigrate', () => {
  it('new database: no backup, start goes on', async () => {
    const { db } = fakeDb({ migrationsTable: false });
    const { d, logs, dump } = deps(db);
    expect(await preMigrate(d)).toBe(0);
    expect(dump).not.toHaveBeenCalled();
    expect(backupFiles()).toEqual([]);
    expect(logs.join('\n')).toMatch(/\[backup\] New database/);
    expect(db.end).toHaveBeenCalled();
  });

  it('database up to date: no backup, start goes on', async () => {
    const { db } = fakeDb({ applied: SHIPPED });
    const { d, dump } = deps(db);
    expect(await preMigrate(d)).toBe(0);
    expect(dump).not.toHaveBeenCalled();
    expect(backupFiles()).toEqual([]);
  });

  it('pending migrations on an empty instance: no backup, start goes on', async () => {
    const { db } = fakeDb({ applied: SHIPPED.slice(0, 1), hasUser: false });
    const { d, dump } = deps(db);
    expect(await preMigrate(d)).toBe(0);
    expect(dump).not.toHaveBeenCalled();
  });

  it('database behind with data: writes glou-backup-before-migration-<timestamp>.sql.gz, then lets the migrations run', async () => {
    const { db } = fakeDb({ applied: SHIPPED.slice(0, 2) });
    const { d, logs, dump } = deps(db);
    expect(await preMigrate(d)).toBe(0);
    expect(dump).toHaveBeenCalledWith(path.join(backupsDir, EXPECTED_NAME));
    expect(backupFiles()).toEqual([EXPECTED_NAME]);
    const out = logs.join('\n');
    expect(out).toContain(SHIPPED[2]);
    expect(out).toContain(path.join(backupsDir, EXPECTED_NAME));
  });

  it('dump fails: exit 1, explicit [backup] message, no file left behind', async () => {
    const { db } = fakeDb({ applied: SHIPPED.slice(0, 2) });
    const failingDump = vi.fn(async (dest: string) => {
      fs.writeFileSync(dest, 'half a dump');
      throw new Error('PG_DUMP_FAILED (exit 1): pg_dump: error: connection refused');
    });
    const { d, errors } = deps(db, { dump: failingDump });
    expect(await preMigrate(d)).toBe(1);
    expect(backupFiles()).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^\[backup\] /);
    expect(errors[0]).toContain('PG_DUMP_FAILED');
    expect(errors[0]).toContain('Nothing was migrated');
    expect(errors[0]).toContain('sudo chown 1001:1001 backups');
  });

  it('backups folder not writable: exit 1 before any dump, and says how to fix the folder', async () => {
    const { db } = fakeDb({ applied: SHIPPED.slice(0, 2) });
    // A file where the folder should be: neither creatable nor writable, even as root.
    const blocked = path.join(tmp, 'blocked');
    fs.writeFileSync(blocked, '');
    const { d, errors, dump } = deps(db, { backupsDir: path.join(blocked, 'backups') });
    expect(await preMigrate(d)).toBe(1);
    expect(dump).not.toHaveBeenCalled();
    expect(errors[0]).toMatch(/^\[backup\] /);
    expect(errors[0]).toContain('not writable');
    expect(errors[0]).toContain('mkdir -p backups && sudo chown 1001:1001 backups');
    expect(errors[0]).toContain('Nothing was migrated');
  });

  it('database unreachable: exit 1 with a [backup] message (no migration either)', async () => {
    const { d, errors, dump } = deps(fakeDb({}).db, {
      connect: async () => { throw new Error('connect ECONNREFUSED 172.18.0.2:5432'); },
    });
    expect(await preMigrate(d)).toBe(1);
    expect(dump).not.toHaveBeenCalled();
    expect(errors[0]).toMatch(/^\[backup\] Could not check for pending migrations: connect ECONNREFUSED/);
  });
});

describe('preMigrate after a failed migrate deploy (restart loop)', () => {
  // `restart: unless-stopped` starts the container again after `prisma migrate
  // deploy` fails: the migration is still pending. Without a guard, every start
  // would write another full dump that retention never deletes.
  const LATER = new Date('2026-11-01T08:31:00.000Z');
  // The failed deploy right after the first start's backup (NOW).
  const FAILED = [new Date('2026-11-01T08:30:05.000Z')];

  async function firstStart(db: ReturnType<typeof fakeDb>['db']) {
    const first = deps(db);
    expect(await preMigrate(first.d)).toBe(0);
    expect(backupFiles()).toEqual([EXPECTED_NAME]);
  }

  it('second start after a failed deploy: no new file, the earlier backup is named in the log', async () => {
    // The failed migration's row has no finished_at: the last change stays before the backup.
    const { db } = fakeDb({ applied: SHIPPED.slice(0, 2), backupRuns: [], failedStartedAt: FAILED });
    await firstStart(db);

    const second = deps(db, { now: () => LATER });
    expect(await preMigrate(second.d)).toBe(0);
    expect(second.dump).not.toHaveBeenCalled();
    expect(backupFiles()).toEqual([EXPECTED_NAME]);
    expect(second.logs.join('\n')).toContain(`No new backup: ${path.join(backupsDir, EXPECTED_NAME)}`);

    // Nor on the tenth start.
    for (let i = 0; i < 8; i++) expect(await preMigrate(deps(db, { now: () => LATER }).d)).toBe(0);
    expect(backupFiles()).toEqual([EXPECTED_NAME]);
  });

  it('Glou ran since that backup (listed in backup_runs): a new backup', async () => {
    const { db } = fakeDb({ applied: SHIPPED.slice(0, 2), backupRuns: [`/app/backups/${EXPECTED_NAME}`], failedStartedAt: FAILED });
    await firstStart(db);
    const second = deps(db, { now: () => LATER });
    expect(await preMigrate(second.d)).toBe(0);
    expect(second.dump).toHaveBeenCalledTimes(1);
    expect(backupFiles()).toHaveLength(2);
  });

  it('a migration finished after that backup: a new backup', async () => {
    const { db } = fakeDb({
      applied: SHIPPED.slice(0, 2), backupRuns: [], failedStartedAt: FAILED, lastMigrationChange: new Date('2026-11-01T08:30:30Z'),
    });
    await firstStart(db);
    const second = deps(db, { now: () => LATER });
    expect(await preMigrate(second.d)).toBe(0);
    expect(second.dump).toHaveBeenCalledTimes(1);
    expect(backupFiles()).toHaveLength(2);
  });

  it('the earlier file is truncated (container killed mid-dump): a new backup', async () => {
    const { db } = fakeDb({ applied: SHIPPED.slice(0, 2), backupRuns: [], failedStartedAt: FAILED });
    fs.mkdirSync(backupsDir, { recursive: true });
    fs.writeFileSync(path.join(backupsDir, EXPECTED_NAME), zlib.gzipSync('-- dump').subarray(0, 10));
    const second = deps(db, { now: () => LATER });
    expect(await preMigrate(second.d)).toBe(0);
    expect(second.dump).toHaveBeenCalledTimes(1);
  });

  it('no backup_runs table (cannot tell whether Glou ran): a new backup', async () => {
    const { db } = fakeDb({ applied: SHIPPED.slice(0, 2), failedStartedAt: FAILED });
    await firstStart(db);
    const second = deps(db, { now: () => LATER });
    expect(await preMigrate(second.d)).toBe(0);
    expect(second.dump).toHaveBeenCalledTimes(1);
  });

  it('a scheduled backup is never reused: only glou-backup-before-migration-* files count', async () => {
    const { db } = fakeDb({ applied: SHIPPED.slice(0, 2), backupRuns: [], failedStartedAt: FAILED });
    fs.mkdirSync(backupsDir, { recursive: true });
    fs.writeFileSync(path.join(backupsDir, 'glou-backup-2026-11-01T08-00-00-000Z.sql.gz'), zlib.gzipSync('-- dump'));
    const run = deps(db);
    expect(await preMigrate(run.d)).toBe(0);
    expect(run.dump).toHaveBeenCalledTimes(1);
  });
  it('file not listed, newer than every finished migration, but NO failed migration row: a new backup', async () => {
    // Nothing in the database ties the file to a failed attempt: the data may have changed since.
    const { db } = fakeDb({ applied: SHIPPED.slice(0, 2), backupRuns: [] });
    await firstStart(db);
    const second = deps(db, { now: () => LATER });
    expect(await preMigrate(second.d)).toBe(0);
    expect(second.dump).toHaveBeenCalledTimes(1);
    expect(backupFiles()).toHaveLength(2);
  });

  it('that backup restored, the previous image (before v2026.10.3) used for days, then the update again: a new backup', async () => {
    // The restore brought back the history as it was before the attempt: no failed row,
    // and an image that old never lists files in backup_runs.
    const { db } = fakeDb({ applied: SHIPPED.slice(0, 2), backupRuns: [], failedStartedAt: FAILED });
    await firstStart(db);
    const afterRestore = fakeDb({ applied: SHIPPED.slice(0, 2), backupRuns: [] }).db;
    const retry = deps(afterRestore, { now: () => new Date('2026-11-05T09:00:00.000Z') });
    expect(await preMigrate(retry.d)).toBe(0);
    expect(retry.dump).toHaveBeenCalledTimes(1);
    expect(backupFiles()).toHaveLength(2);
  });

  it('a failed row older than the file (from an earlier attempt): a new backup', async () => {
    const { db } = fakeDb({ applied: SHIPPED.slice(0, 2), backupRuns: [], failedStartedAt: [new Date('2026-10-20T00:00:00Z')] });
    await firstStart(db);
    const second = deps(db, { now: () => LATER });
    expect(await preMigrate(second.d)).toBe(0);
    expect(second.dump).toHaveBeenCalledTimes(1);
  });
});

describe('api/Dockerfile start command', () => {
  it('runs the pre-migration backup before prisma migrate deploy, chained with && so a failure stops the start', () => {
    const dockerfile = fs.readFileSync(path.resolve(__dirname, '../../Dockerfile'), 'utf8');
    const cmd = dockerfile.split('\n').find((line) => line.startsWith('CMD '));
    expect(cmd).toBeDefined();
    expect(cmd).toMatch(/node dist\/api\/src\/scripts\/pre-migrate\.js && npx prisma migrate deploy && node dist\/api\/src\/index\.js/);
  });

  it('the compiled script path matches the build layout (rootDir "..")', () => {
    expect(fs.existsSync(path.resolve(__dirname, '../../src/scripts/pre-migrate.ts'))).toBe(true);
  });
});
