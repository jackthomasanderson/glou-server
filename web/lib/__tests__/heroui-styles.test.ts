// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { button, card, checkbox, chip, input, listboxItem, modal, popover, select, tabs } from '@heroui/react';

// #721: Tailwind 4 never scans node_modules on its own. After the Tailwind 4
// move (#412), the classes HeroUI puts on its own components were silently
// left out of the stylesheet: 57 % of them for the components below (button
// text and focus ring, dialog margins, max height and phone sheet, menu item
// hover, checkbox box...). globals.css has to @source HeroUI's theme.
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
    // helpers) and can never be generated: 6 of 650 with HeroUI 2.8. Before
    // the fix, 377 were missing.
    expect(missing.length / used.length, missing.join(' ')).toBeLessThan(0.02);
  }, 60_000);
});
