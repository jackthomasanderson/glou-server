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

describe('page headers (#701)', () => {
  // Screens outside the app shell (sign-in, password, lock, guest link) have
  // their own centred card layout and keep their own title.
  const OWN_LAYOUT = new Set([
    'components/auth/LoginForm.tsx',
    'components/auth/RegisterForm.tsx',
    'components/auth/LockScreen.tsx',
    'components/auth/ForcedPasswordChange.tsx',
    'app/forgot-password/ForgotPasswordClient.tsx',
    'app/reset-password/[token]/ResetPasswordClient.tsx',
    'app/guest/[token]/GuestClient.tsx',
    'components/ui/PageHeader.tsx',
  ]);
  const root = path.resolve(__dirname, '../..');
  const sources = (dir: string): string[] =>
    fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : sources(rel);
      return /\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name) ? [rel] : [];
    });

  it('every app page takes its h1 from the shared PageHeader', () => {
    const own = [...sources('app'), ...sources('components')].filter(
      (f) => !OWN_LAYOUT.has(f) && /<h1[\s>]/.test(read(f)),
    );
    expect(own).toEqual([]);
  });
});

describe('cellar filters (#701)', () => {
  it('say what they filter instead of a bare « Toutes »', () => {
    const src = read('components/cellars/CellarDashboard.tsx');
    expect(src).not.toMatch(/t\('filters\.all'\)/);
    expect(src).toMatch(/t\('cellars\.filters\.allTypes'\)/);
    expect(src).toMatch(/t\('cellars\.filters\.allStates'\)/);
    const fr = JSON.parse(read('public/locales/fr/common.json'));
    expect(fr.cellars.filters).toEqual({ allTypes: 'Tous les types', allStates: 'Tous les états' });
  });
});

describe('inventory headings (#701)', () => {
  it('names the filter panel and the list with h2 headings for screen readers', () => {
    const src = read('components/inventory/InventoryDashboard.tsx');
    expect(src).toMatch(/<h2 className="sr-only">\{t\('inventory\.headings\.filters'\)\}<\/h2>/);
    expect(src).toMatch(/<h2 className="sr-only">\{t\('inventory\.headings\.list'\)\}<\/h2>/);
  });
});

describe('create buttons (#701)', () => {
  it('no page keeps a round create button visible on a computer', () => {
    for (const f of [
      'components/collections/CollectionsDashboard.tsx',
      'components/tastings/TastingsDashboard.tsx',
    ]) {
      expect(read(f)).not.toMatch(/isIconOnly[\s\S]{0,200}fixed bottom-/);
    }
  });
});
