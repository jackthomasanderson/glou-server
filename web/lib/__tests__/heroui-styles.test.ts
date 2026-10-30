// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { button, card, checkbox, chip, input, listboxItem, modal, popover, select, tabs } from '@heroui/react';

// #721: Tailwind 4 drops paths listed in a .gitignore, and the repo root
// ignores node_modules/. From a git checkout (npm run dev, CI, local builds),
// the classes HeroUI puts on its own components were left out of the
// stylesheet: 231 of the 341 used by the components below (input borders,
// button text and focus ring, dialog margins and phone sheet, menu hover...).
// globals.css has to @source HeroUI explicitly.
//
// The class names are read from HeroUI's theme at run time, never written
// here: Tailwind also scans this file, and a literal class name in it would
// be generated and make the test pass on its own.
const root = join(__dirname, '..', '..');

function classesOf(styles: unknown): string[] {
  const parts = typeof styles === 'string'
    ? [styles]
    : Object.values(styles as Record<string, () => string>).map((slot) => slot());
  return parts.join(' ').split(/\s+/).filter(Boolean);
}

function selector(className: string): string {
  return '.' + className.replace(/[:[\]()%=/.!&*>~+,#'"@]/g, (c) => `\\${c}`);
}

describe("HeroUI's component styles are generated (#721)", () => {
  it('the stylesheet contains the classes of the HeroUI components the app uses', async () => {
    const from = join(root, 'app', 'globals.css');
    const { css } = await postcss([tailwind({ base: root })]).process(readFileSync(from, 'utf8'), { from });

    const used = [...new Set([
      button({ color: 'primary' }),
      modal({ size: 'md', placement: 'top', scrollBehavior: 'inside' }),
      modal({ size: 'full', placement: 'bottom' }),
      select({}),
      listboxItem({}),
      checkbox({}),
      input({ variant: 'bordered', labelPlacement: 'outside' }),
      card({ isPressable: true }),
      chip({ variant: 'flat', color: 'primary' }),
      tabs({}),
      popover({}),
    ].flatMap(classesOf))];
    const missing = used.filter((c) => !css.includes(selector(c)));

    // A handful are not Tailwind utilities at all (e.g. HeroUI's `*-inherit`
    // helpers) and can never be generated: 6 of 341 with HeroUI 2.8. Without
    // the @source, 231 are missing (68 %).
    expect(missing.length / used.length, missing.join(' ')).toBeLessThan(0.05);
  }, 60_000);
});
