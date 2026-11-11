// Theme colour tokens (#648), read by tailwind.config.ts, ThemeWrapper and the
// contrast test (lib/__tests__/theme-contrast.test.ts). Every value here is
// hand-picked, not computed: the test fails if a text/background pair the app
// uses drops below WCAG AA (4.5:1) in either theme.

/** One stop scale, HeroUI style: 50..900 plus DEFAULT and foreground. */
export interface ColorScale {
  50: string; 100: string; 200: string; 300: string; 400: string;
  500: string; 600: string; 700: string; 800: string; 900: string;
  DEFAULT: string;
  foreground: string;
}

export type AccentName = 'indigo' | 'rose' | 'amber' | 'emerald' | 'cyan' | 'violet';

export interface AccentPreset {
  name: AccentName;
  /** Light-theme scale; its DEFAULT is the value stored in User.accentColor. */
  light: ColorScale;
  /** Dark-theme scale: reversed like HeroUI's own (50 = darkest), lighter DEFAULT. */
  dark: ColorScale;
  /** Values stored before #648, still accepted when read back. */
  legacy: string[];
}

/** Text drawn on a solid dark-theme colour: light fills need dark text. */
const DARK_THEME_ON_FILL = '#0F172A';

// The Tailwind palette of each hue, 50..950.
type Palette = [string, string, string, string, string, string, string, string, string, string, string];

/**
 * Light scale: the pale stops follow the palette; from 500 on it is shifted
 * one or two steps darker, so the shades HeroUI and the app use as text
 * (primary-600 in flat chips and the active sidebar entry, primary-700 in
 * banners) stay readable on the pale tint behind them.
 * Dark scale: the mirror image, the shades used as text being light ones.
 */
function scales(p: Palette, lightDefault: string, darkDefault: string): { light: ColorScale; dark: ColorScale } {
  const [c50, c100, c200, c300, c400, , c600, c700, c800, c900, c950] = p;
  return {
    light: {
      50: c50, 100: c100, 200: c200, 300: c300, 400: c400,
      500: c600, 600: c800, 700: c900, 800: c950, 900: c950,
      DEFAULT: lightDefault, foreground: '#ffffff',
    },
    dark: {
      50: c950, 100: c900, 200: c800, 300: c700, 400: c600,
      500: c400, 600: c300, 700: c200, 800: c100, 900: c50,
      DEFAULT: darkDefault, foreground: DARK_THEME_ON_FILL,
    },
  };
}

function accent(name: AccentName, p: Palette, lightDefault: string, darkDefault: string, legacy: string): AccentPreset {
  return { name, ...scales(p, lightDefault, darkDefault), legacy: [legacy] };
}

/** Profile accent colours (#648): each one passes AA as text and as a button, in both themes. */
export const ACCENT_PRESETS: readonly AccentPreset[] = [
  accent('indigo',
    ['#eef2ff', '#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81', '#1e1b4b'],
    '#4f46e5', '#a5b4fc', '#6366f1'),
  accent('rose',
    ['#fff1f2', '#ffe4e6', '#fecdd3', '#fda4af', '#fb7185', '#f43f5e', '#e11d48', '#be123c', '#9f1239', '#881337', '#4c0519'],
    '#be123c', '#fda4af', '#f43f5e'),
  accent('amber',
    ['#fffbeb', '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f', '#451a03'],
    '#b45309', '#fbbf24', '#f59e0b'),
  accent('emerald',
    ['#ecfdf5', '#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#059669', '#047857', '#065f46', '#064e3b', '#022c22'],
    '#047857', '#34d399', '#10b981'),
  accent('cyan',
    ['#ecfeff', '#cffafe', '#a5f3fc', '#67e8f9', '#22d3ee', '#06b6d4', '#0891b2', '#0e7490', '#155e75', '#164e63', '#083344'],
    '#0e7490', '#22d3ee', '#06b6d4'),
  accent('violet',
    ['#f5f3ff', '#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95', '#2e1065'],
    '#7c3aed', '#c4b5fd', '#8b5cf6'),
];

export const DEFAULT_ACCENT_PRESET = ACCENT_PRESETS[0];
/** Stored in User.accentColor when nothing else was chosen. */
export const DEFAULT_ACCENT = DEFAULT_ACCENT_PRESET.light.DEFAULT;

/**
 * The preset a stored accent colour stands for: its current value, or a value
 * from before #648. Anything else (only the API could store it) falls back to
 * the default, whose contrast is checked.
 */
export function resolveAccentPreset(stored: string | null | undefined): AccentPreset {
  const value = (stored ?? '').toLowerCase();
  return ACCENT_PRESETS.find((p) => p.light.DEFAULT === value || p.legacy.includes(value))
    ?? DEFAULT_ACCENT_PRESET;
}

// Burgundy (cigars, brand): a full scale, or HeroUI's purple one shows through
// in flat buttons and chips (text-secondary-600).
const BURGUNDY: Palette = [
  '#fbf2f4', '#f6e3e7', '#ecc5cd', '#e2a3b0', '#c86b7f', '#a23a50', '#7b1e30', '#641826', '#4d121d', '#360c14', '#24080e',
];

const secondaryLight: ColorScale = {
  50: BURGUNDY[0], 100: BURGUNDY[1], 200: BURGUNDY[2], 300: BURGUNDY[3], 400: BURGUNDY[4],
  500: BURGUNDY[5], 600: BURGUNDY[6], 700: BURGUNDY[7], 800: BURGUNDY[8], 900: BURGUNDY[9],
  DEFAULT: '#7B1E30', foreground: '#ffffff',
};

const secondaryDark: ColorScale = {
  50: BURGUNDY[10], 100: BURGUNDY[9], 200: BURGUNDY[8], 300: BURGUNDY[7], 400: BURGUNDY[6],
  500: BURGUNDY[5], 600: BURGUNDY[3], 700: BURGUNDY[2], 800: BURGUNDY[1], 900: BURGUNDY[0],
  DEFAULT: '#E2A3B0', foreground: DARK_THEME_ON_FILL,
};

// Status colours: full scales too, HeroUI's own ones (pink red, yellow) were
// under 4.5:1 in flat chips (text-danger-600, text-warning-700...).
const DANGER = scales(
  ['#fef2f2', '#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d', '#450a0a'],
  '#b91c1c', '#F87171');
const SUCCESS = scales(
  ['#ecfdf5', '#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#059669', '#047857', '#065f46', '#064e3b', '#022c22'],
  '#047857', '#34D399');
const WARNING = scales(
  ['#fffbeb', '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f', '#451a03'],
  '#b45309', '#F59E0B');

/** HeroUI theme colours (merged over HeroUI's defaults by its plugin). */
export const THEME_COLORS = {
  light: {
    // `primary` is the default accent; ThemeWrapper swaps in the user's.
    primary: DEFAULT_ACCENT_PRESET.light,
    secondary: secondaryLight,
    background: '#FAFAFA',
    content1: '#FFFFFF',
    content2: '#F8F9FA',
    content3: '#F1F5F9',
    // Secondary text (ux-ui.md §2.1): zinc-400/500 were 2.6:1 and 4.4:1.
    foreground: { 400: '#666666', 500: '#666666' },
    // Darker than the usual #EF4444 / #10B981 / #F59E0B, which fail as text
    // on white and under white text.
    danger: DANGER.light,
    success: SUCCESS.light,
    warning: WARNING.light,
    focus: '#1d4ed8',
  },
  dark: {
    primary: DEFAULT_ACCENT_PRESET.dark,
    secondary: secondaryDark,
    background: '#0F172A',
    content1: '#1E293B',
    content2: '#273548',
    content3: '#334155',
    foreground: { 400: '#94A3B8', 500: '#94A3B8' },
    // Light fills, so dark text on them (white was 2.2:1 to 3.9:1).
    // Flat danger chips use danger-500 as text in the dark theme (HeroUI).
    danger: { ...DANGER.dark, 500: '#fca5a5' },
    success: SUCCESS.dark,
    warning: WARNING.dark,
    // HeroUI's #006FEE focus ring was under 3:1 on the dark surfaces.
    focus: '#93c5fd',
  },
} as const;
