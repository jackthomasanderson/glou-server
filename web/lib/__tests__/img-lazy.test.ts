import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// #211: every <img> must opt into lazy loading + async decoding, otherwise a
// long inventory list downloads and decodes all its photos up front.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === '.next' || name === '__tests__') return [];
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

describe('<img> loading attributes (#211)', () => {
  it('every <img> declares loading="lazy" and decoding="async"', () => {
    const root = join(__dirname, '..', '..');
    const offenders: string[] = [];
    for (const dir of ['components', 'app']) {
      for (const file of sources(join(root, dir))) {
        const code = readFileSync(file, 'utf8');
        for (const m of code.matchAll(/<img\b[^>]*>/gs)) {
          if (!/loading="lazy"/.test(m[0]) || !/decoding="async"/.test(m[0])) offenders.push(file);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
