import fs from 'fs';
import path from 'path';
import readline from 'readline';
import zlib from 'zlib';
import { listMigrationFolders } from '../scripts/pre-migrate';

/**
 * #471 (lot Z): which version of Glou took a backup, read in the dump itself.
 *
 * A dump holds its schema and its `_prisma_migrations` history. Restored from
 * the admin page, it replaces the schema under the running API, whose client
 * is generated for this image's migrations: a backup taken before an update
 * (the families migration, for one) would leave the API reading tables and
 * columns that do not exist yet, failing on every page until the next start.
 * Such a backup is refused instead; the documented way back is to restore it
 * with the image that took it (wiki 31), or with the documented command
 * (wiki 30) and a restart, which migrates it — after a backup — on the way.
 */

/** The migration folders this image ships, as `prisma migrate deploy` reads them. */
export const shippedMigrations = (migrationsDir = path.resolve(process.cwd(), 'prisma', 'migrations')): string[] =>
  listMigrationFolders(migrationsDir);

const COPY_HEADER = /^COPY (?:public\.)?"?_prisma_migrations"? \(([^)]*)\) FROM stdin;$/;
const NULL = '\\N';

/**
 * The migrations a plain `pg_dump` (gzipped) records as applied: finished and
 * not rolled back, as `prisma migrate deploy` counts them. `null` when it
 * cannot tell — no migration history in the dump, or a file it cannot read
 * (the restore then reports what is wrong with it, as before).
 */
export function dumpedMigrations(filePath: string): Promise<string[] | null> {
  return new Promise((resolve) => {
    const file = fs.createReadStream(filePath);
    const input = zlib.createGunzip();
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    let columns: string[] | null = null;
    const applied: string[] = [];
    let settled = false;
    const finish = (result: string[] | null) => {
      if (settled) return;
      settled = true;
      lines.close();
      file.destroy();
      input.destroy();
      resolve(result);
    };
    // An unreadable or truncated file: unknown here, the restore says why.
    file.on('error', () => finish(null));
    input.on('error', () => finish(null));
    // readline passes its input's errors on: handled, or they would be thrown.
    lines.on('error', () => finish(null));
    lines.on('line', (line) => {
      if (settled) return;
      if (!columns) {
        const header = COPY_HEADER.exec(line);
        if (header) columns = header[1].split(',').map((column) => column.trim().replace(/^"|"$/g, ''));
        return;
      }
      if (line === '\\.') {
        finish(applied);
        return;
      }
      const values = line.split('\t');
      const at = (column: string) => values[columns!.indexOf(column)];
      if (at('finished_at') !== NULL && at('rolled_back_at') === NULL) applied.push(at('migration_name'));
    });
    lines.on('close', () => finish(null));
    file.pipe(input);
  });
}

export type BackupVersion = 'same' | 'older' | 'newer' | 'unknown';

/**
 * How a dump's migrations compare with this image's: `older` when it lacks one
 * this image ships (taken before an update), `newer` when it holds one this
 * image does not know, dated after its last one (taken by a later version).
 * An unknown migration dated before that is a row of a migration since
 * removed from the folder (the repository deleted a few, once applied on
 * some instances), not a sign of a later version: ignored.
 */
export function compareVersions(shipped: readonly string[], dumped: readonly string[] | null): BackupVersion {
  if (dumped === null) return 'unknown';
  const inDump = new Set(dumped);
  const known = new Set(shipped);
  // Migration folder names start with their date: byte order is date order.
  const last = [...shipped].sort().at(-1) ?? '';
  if (dumped.some((name) => !known.has(name) && name > last)) return 'newer';
  if (shipped.some((name) => !inDump.has(name))) return 'older';
  return 'same';
}
