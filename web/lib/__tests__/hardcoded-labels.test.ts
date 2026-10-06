import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// #219 / #221 — labels typed straight into the JSX stay in one language whatever
// the user chose, and a glued " €" ignores the language's typography. Source
// guard: user-visible attributes go through t(), amounts through formatCurrency().

const ROOT = path.resolve(__dirname, '../..');

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return ['__tests__', 'node_modules', '.next'].includes(e.name) ? [] : sources(full);
    return /\.tsx$/.test(e.name) ? [full] : [];
  });
}
const files = ['app', 'components'].flatMap((d) => sources(path.join(ROOT, d)));
const rel = (f: string) => path.relative(ROOT, f);

describe('no hand-typed user-facing text in attributes (#219)', () => {
  // aria-label / placeholder / title written as a literal sentence (a space, or an accent).
  const literal = /\b(aria-label|placeholder|title)="[^"{]*[ àâçéèêëîïôûù][^"]*"/g;

  it('uses t() for aria-label, placeholder and title', () => {
    const offenders = files.flatMap((f) =>
      [...fs.readFileSync(f, 'utf8').matchAll(literal)].map((m) => `${rel(f)}: ${m[0]}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe('amounts go through formatCurrency (#221)', () => {
  it('has no "} €" glued after an expression', () => {
    const offenders = files.filter((f) => /\}\s?€/.test(fs.readFileSync(f, 'utf8'))).map(rel);
    expect(offenders).toEqual([]);
  });
});
