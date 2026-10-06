import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// #201 (WCAG 4.1.3 Status Messages) — an error banner that appears without the
// user moving focus is announced only if it carries a live-region role. Nearly
// every banner was a plain <div>, so a blind user submitting a wrong password
// heard nothing. This guard fails when a new hand-written error banner is added
// without `role="alert"` (or a conditional role), so the fix cannot silently rot.

const ROOT = path.resolve(__dirname, '../..');
const DIRS = ['app', 'components'];

// Not messages: purely decorative / structural uses of the same classes.
const NOT_A_BANNER = new Set(['components/analytics/AnalyticsDashboard.tsx']); // "deleted" stat tile

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : sources(full);
    return /\.tsx$/.test(e.name) ? [full] : [];
  });
}

describe('error banners are announced to screen readers (#201)', () => {
  const files = DIRS.flatMap((d) => sources(path.join(ROOT, d)));
  const banner = /<div\b[^>]*className=\{?["'`][^"'`]*bg-danger-50 border border-danger-200[^"'`]*["'`]/g;

  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('gives every error banner role="alert" (or a conditional alert/status role)', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = path.relative(ROOT, file).split(path.sep).join('/');
      if (NOT_A_BANNER.has(rel)) continue;
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(banner)) {
        if (!/\brole=/.test(m[0])) {
          const line = src.slice(0, m.index).split('\n').length;
          offenders.push(`${rel}:${line}`);
        }
      }
      // multi-line opening tags: role may sit on its own line before className
      for (const m of src.matchAll(/<div\b([^>]*?)>/gs)) {
        if (/bg-danger-50 border-danger-200/.test(m[1]) && !/\brole=/.test(m[1])) {
          offenders.push(`${rel}:${src.slice(0, m.index).split('\n').length}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
