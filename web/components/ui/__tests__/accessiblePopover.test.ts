// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// #729: a HeroUI Select, Dropdown, Popover or Tooltip (#976) opened inside a
// dialog is hidden from screen readers unless it carries ACCESSIBLE_POPOVER (see
// components/ui/accessiblePopover.ts; overlayInDialog.test.tsx shows why).
// A SingleSelect sets it itself. An Autocomplete needs nothing: react-aria's
// combobox keeps its own list visible.

const root = join(__dirname, '..', '..', '..');

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
const tags = ['Select', 'Dropdown', 'Popover', 'Tooltip'].flatMap((name) => files.flatMap((file) =>
  openingTags(readFileSync(file, 'utf8'), name).map(({ line, tag }) => ({ where: `${relative(root, file)}:${line}`, tag }))));

describe('lists and menus readable by screen readers inside a dialog (#729)', () => {
  it('finds the menus', () => {
    expect(tags.length).toBeGreaterThan(5);
  });

  it.each(tags.map(({ where, tag }) => [where, tag]))('%s carries ACCESSIBLE_POPOVER', (_where, tag) => {
    expect(tag).toContain('ACCESSIBLE_POPOVER');
  });
});
