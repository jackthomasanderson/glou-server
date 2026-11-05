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

/** The opening tag of each `<Select`, up to its first `>` outside braces (an arrow function holds one). */
function selectTags(code: string): Array<{ line: number; tag: string }> {
  return [...code.matchAll(/<Select\s/g)].map((start) => {
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

describe('A single-choice menu is never emptied by picking its choice again (recette n°5 of #847)', () => {
  // HeroUI's Select lets the chosen option be clicked again to unselect it.
  // In "Ajouter des bouteilles", picking the chosen cellar again emptied the
  // field and the bottles were saved "Sans cave". A single choice keeps one:
  // "Aucune cave", "Toutes"… are choices of the list. A menu whose emptying
  // IS a choice (an optional field without a "—", a filter without "all")
  // says so in a `select-may-empty:` comment in its tag.
  const tags = ['app', 'components'].flatMap((dir) => sources(join(root, dir))).flatMap((file) =>
    selectTags(readFileSync(file, 'utf8')).map(({ line, tag }) => ({ where: `${relative(root, file)}:${line}`, tag })));

  it('finds the menus', () => {
    expect(tags.length).toBeGreaterThan(30);
  });

  it.each(tags.map(({ where, tag }) => [where, tag]))('%s keeps its choice', (_where, tag) => {
    const kept = tag.includes('disallowEmptySelection') || /selectionMode="multiple"/.test(tag) || tag.includes('select-may-empty:');
    expect(kept).toBe(true);
  });
});
