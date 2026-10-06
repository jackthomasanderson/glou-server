import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Source guards for two layout rules that jsdom cannot render.
const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '../..', p), 'utf8');

describe('print layout (#190)', () => {
  it('hides the page header when printing, like the navigation', () => {
    const layout = read('components/ui/MainLayout.tsx');
    expect(layout).toMatch(/<header className="[^"]*\bprint:hidden\b/);
  });
});

describe('scrollbar stability on older Safari (#214)', () => {
  it('falls back to a permanent scrollbar where scrollbar-gutter is unsupported', () => {
    const css = read('app/globals.css');
    expect(css).toMatch(/@supports not \(scrollbar-gutter: stable\)\s*\{\s*html\s*\{\s*overflow-y:\s*scroll/);
  });
});
