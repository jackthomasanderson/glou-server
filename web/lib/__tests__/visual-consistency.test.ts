import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// #701: source guards for the visual consistency pass (jsdom does not
// apply stylesheets).
const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '../..', p), 'utf8');

describe('keyboard focus ring (#701)', () => {
  it('every element focused from the keyboard gets the HeroUI focus outline', () => {
    const css = read('app/globals.css');
    // In the base layer, so a component's own outline utilities still win.
    expect(css).toMatch(
      /@layer base\s*\{[^}]*:focus-visible\s*\{\s*outline:\s*2px solid hsl\(var\(--heroui-focus\)\);\s*outline-offset:\s*2px;/,
    );
  });
});
