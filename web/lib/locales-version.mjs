// Build-time only (read by next.config.mjs, never bundled for the browser).
//
// #471 (recette v2): after an update, a page could show raw keys and old
// labels until reloaded. The translations were fetched from the same URL in
// every version (/locales/fr/common.json), and the service worker of the
// previous version, still in charge on the first visit after the update,
// answered that URL from its precache with the previous file. The URL now
// carries a fingerprint of the translation files themselves, so a new
// version asks for a URL no older cache holds.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * A short fingerprint of every file under `localesDir` (`<lng>/<ns>.json`):
 * changes whenever one of them changes, and only then.
 */
export function localesVersion(localesDir) {
  const hash = createHash('sha256');
  const files = readdirSync(localesDir, { recursive: true })
    .map((entry) => String(entry).split(path.sep).join('/'))
    .filter((entry) => entry.endsWith('.json'))
    .sort();
  for (const file of files) {
    hash.update(file);
    hash.update('\0');
    hash.update(readFileSync(path.join(localesDir, file)));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}
