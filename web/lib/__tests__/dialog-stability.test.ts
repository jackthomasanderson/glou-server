import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');

describe('Select menus open without a flash (#709)', () => {
  // framer-motion 11 removes its opening animation one frame before writing
  // the final opacity, so every HeroUI popover (Select, Dropdown, Autocomplete)
  // fell back to opacity 0 / scale 0.8 for one frame about 340 ms after
  // opening. Measured frame by frame in Chromium: 6 flashes out of 6 openings
  // on 11.18.2, none on 12.43.0. HeroUI accepts both (`>=11.5.6 || >=12`).
  it('installs framer-motion 12 or later', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'node_modules', 'framer-motion', 'package.json'), 'utf8'));
    expect(Number(pkg.version.split('.')[0])).toBeGreaterThanOrEqual(12);
  });
});
