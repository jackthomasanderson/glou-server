import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { semanticColors } from '@heroui/react';
import { ACCENT_PRESETS, THEME_COLORS, type AccentPreset } from '@/lib/theme-colors';

// #648: WCAG 2.2 1.4.3 asks 4.5:1 for normal text. The ratios below are
// computed from the theme tokens themselves, in both themes, for every accent
// preset, so a colour change that makes text unreadable fails here.

const AA = 4.5;

function rgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `color` at `alpha` over `under`, as a browser paints `bg-primary/20`. */
function over(color: string, alpha: number, under: string): string {
  const top = rgb(color);
  const bottom = rgb(under);
  return `#${top.map((c, i) => Math.round(c * alpha + bottom[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
}

type Theme = 'light' | 'dark';
type Scale = Record<string, string>;

/** The colours HeroUI ends up with: its defaults, ours on top (as its plugin merges them). */
function themeColors(theme: Theme, accent: AccentPreset): Record<string, Scale> {
  const ours = { ...THEME_COLORS[theme], primary: accent[theme] } as Record<string, unknown>;
  const base = semanticColors[theme] as unknown as Record<string, Scale | string>;
  const merged: Record<string, Scale> = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(ours)])) {
    const asScale = (v: unknown): Scale => (typeof v === 'string' ? { DEFAULT: v } : (v as Scale) ?? {});
    merged[key] = { ...asScale(base[key]), ...asScale(ours[key]) };
  }
  return merged;
}

// Text shade of HeroUI's `flat` variant (its utils/variants.ts), per theme.
const FLAT_TEXT: Record<Theme, Record<string, string>> = {
  light: { primary: '600', secondary: '600', success: '700', warning: '700', danger: '600' },
  dark: { primary: '600', secondary: '600', success: 'DEFAULT', warning: 'DEFAULT', danger: '500' },
};

interface Pair { name: string; text: string; background: string }

function pairs(theme: Theme, accent: AccentPreset): Pair[] {
  const c = themeColors(theme, accent);
  const surfaces = { background: c.background.DEFAULT, content1: c.content1.DEFAULT };
  const list: Pair[] = [];
  for (const [surfaceName, surface] of Object.entries(surfaces)) {
    for (const shade of ['DEFAULT', '400', '500']) {
      list.push({ name: `text-foreground-${shade} on ${surfaceName}`, text: c.foreground[shade], background: surface });
    }
    for (const color of ['primary', 'secondary', 'success', 'warning', 'danger']) {
      // text-*, bordered and light variants: the colour itself as text.
      list.push({ name: `text-${color} on ${surfaceName}`, text: c[color].DEFAULT, background: surface });
      const flatShade = FLAT_TEXT[theme][color];
      list.push({
        name: `flat ${color} (${flatShade}) on ${surfaceName}`,
        text: c[color][flatShade],
        background: over(c[color].DEFAULT, 0.2, surface),
      });
    }
  }
  for (const color of ['primary', 'secondary', 'success', 'warning', 'danger']) {
    list.push({ name: `solid ${color}`, text: c[color].foreground, background: c[color].DEFAULT });
  }
  // Inputs and default chips.
  list.push({ name: 'text-foreground-500 on default-100', text: c.foreground['500'], background: c.default['100'] });
  // The app's own accent banners and avatars.
  list.push({ name: 'text-primary-700 on primary-50', text: c.primary['700'], background: c.primary['50'] });
  list.push({ name: 'text-primary-700 on primary-100', text: c.primary['700'], background: c.primary['100'] });
  list.push({ name: 'text-primary on primary-100', text: c.primary.DEFAULT, background: c.primary['100'] });
  return list;
}

describe('theme contrast (#648)', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const accent of ACCENT_PRESETS) {
      it(`${theme} theme, ${accent.name} accent: every text pair reaches ${AA}:1`, () => {
        const failures = pairs(theme, accent)
          .map((p) => ({ ...p, ratio: contrast(p.text, p.background) }))
          .filter((p) => !(p.ratio >= AA))
          .map((p) => `${p.name}: ${p.text} on ${p.background} = ${p.ratio.toFixed(2)}:1`);
        expect(failures).toEqual([]);
      });
    }
  }

  it('measures a known pair like the WCAG formula', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });
});

// #771: only foreground-400 and darker are checked above (and readable). The
// paler shades stay HeroUI's zinc (foreground-300 is #D4D4D8 in the light
// theme, 1.5:1 on white): HeroUI uses them for disabled table rows, the app
// never for text.
describe('secondary text shades (#771)', () => {
  const root = join(__dirname, '..', '..');
  const sourceFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });

  it('never writes text in a foreground shade paler than 400', () => {
    const offenders = ['app', 'components'].flatMap((dir) => sourceFiles(join(root, dir))).flatMap((file) =>
      readFileSync(file, 'utf8').split('\n').flatMap((line, i) =>
        /(?:^|[\s'"`:])text-foreground-[1-3]00(?![\w/])/.test(line) ? [`${relative(root, file)}:${i + 1}`] : []));
    expect(offenders).toEqual([]);
  });
});
