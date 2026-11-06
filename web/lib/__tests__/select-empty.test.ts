import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(__dirname, '..', '..');

/** Every component source of the app, tests aside. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : sources(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

/** The opening tag of each `<tag`, up to its first `>` outside braces (an arrow function holds one). */
function openingTags(code: string, name: string): Array<{ line: number; tag: string }> {
  return [...code.matchAll(new RegExp(`<${name}\\s`, 'g'))].map((start) => {
    let depth = 0;
    let end = start.index;
    for (; end < code.length; end += 1) {
      const char = code[end];
      if (char === '{') depth += 1;
      else if (char === '}') depth -= 1;
      else if (char === '>' && depth === 0) break;
    }
    return { line: code.slice(0, start.index).split('\n').length, tag: code.slice(start.index, end + 1) };
  });
}

const files = ['app', 'components'].flatMap((dir) => sources(join(root, dir)));
const tagsOf = (name: string) => files.flatMap((file) =>
  openingTags(readFileSync(file, 'utf8'), name).map(({ line, tag }) => ({ where: `${relative(root, file)}:${line}`, tag })));

describe('A single-choice menu is never emptied by picking its choice again (recette n°5 of #847)', () => {
  // HeroUI's Select lets the chosen option be clicked again to unselect it.
  // In "Ajouter des bouteilles", picking the chosen cellar again emptied the
  // field and the bottles were saved "Sans cave". A single choice keeps one:
  // "Aucune cave", "Toutes"… are choices of the list — a SingleSelect
  // (components/ui/SingleSelect.tsx), which also closes the list when the
  // choice is picked again (recette n°5 bis). A HeroUI Select is left for a
  // menu of several choices, or one whose emptying IS a choice (an optional
  // field without a "—", a filter without "all"), said in a
  // `select-may-empty:` comment in its tag.
  const singles = tagsOf('SingleSelect');
  const selects = tagsOf('Select').filter(({ where }) => !where.startsWith(join('components', 'ui', 'SingleSelect.tsx')));

  it('finds the menus', () => {
    expect(singles.length).toBeGreaterThan(30);
  });

  it.each(selects.map(({ where, tag }) => [where, tag]))('%s, a HeroUI Select, says why it may be emptied', (_where, tag) => {
    const kept = /selectionMode="multiple"/.test(tag) || tag.includes('select-may-empty:');
    expect(kept).toBe(true);
  });

  it.each(singles.map(({ where, tag }) => [where, tag]))('%s keeps its choice and closes on it', (_where, tag) => {
    // The SingleSelect sets both; a page must not undo them.
    expect(tag).not.toMatch(/disallowEmptySelection|allowDuplicateSelectionEvents|selectionMode/);
  });
});
