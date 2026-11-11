// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

// #648: in the dark theme the accent, danger, success and warning fills are
// light colours, so the text on them is dark (their `-foreground` token).
// White hard-coded on one of them reads at 1.7 to 2.8:1. Use
// text-<colour>-foreground instead. theme-contrast.test.ts checks the tokens;
// this one checks that the code uses them.

const root = join(__dirname, '..', '..');
const FILL = /(?:^|[\s'"`:])bg-(?:primary|secondary|success|warning|danger)(?![-\w/])/;
const WHITE_TEXT = /(?:^|[\s'"`:])text-white(?![-\w/])/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('text on a theme colour fill (#648)', () => {
  it('never hard-codes white text on a primary/secondary/success/warning/danger fill', () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles(join(root, 'app')), ...sourceFiles(join(root, 'components'))]) {
      const source = readFileSync(file, 'utf8');
      const lines = source.split('\n');
      // Every class string, a template over several lines included.
      for (const { 0: literal, index: at = 0 } of source.matchAll(/`[^`]*`|'[^'\n]*'|"[^"\n]*"/g)) {
        if (!WHITE_TEXT.test(literal)) continue;
        const line = source.slice(0, at).split('\n').length;
        // A template's own text, and the strings picked inside its ${…}.
        const fixed = literal.replace(/\$\{[^}]*\}/g, ' ');
        const picked = [...literal.matchAll(/\$\{[^}]*\}/g)].flatMap(([expr]) => expr.match(/'[^']*'|"[^"]*"/g) ?? []);
        const whiteWithFill = (FILL.test(fixed) && WHITE_TEXT.test(fixed))
          || picked.some((str) => FILL.test(str) && WHITE_TEXT.test(str))
          || (WHITE_TEXT.test(fixed) && picked.some((str) => FILL.test(str)));
        // Or a fill set in a variable the template interpolates
        // (`text-white ${badgeColor}`), declared a few lines above.
        const fillInVariable = WHITE_TEXT.test(fixed) && [...literal.matchAll(/\$\{(\w+)\}/g)].some(([, name]) => {
          const declared = lines.slice(0, line).findLastIndex((l) => new RegExp(`\\b(?:const|let)\\s+${name}\\b`).test(l));
          return declared >= 0 && FILL.test(lines.slice(declared, declared + 4).join('\n'));
        });
        if (whiteWithFill || fillInVariable) offenders.push(`${relative(root, file)}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
