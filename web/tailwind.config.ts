import type { Config } from 'tailwindcss';
import { heroui } from '@heroui/react';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    // Broadened from just `@heroui/theme` to every `@heroui/*` package: some
    // component-internal utility classes (e.g. the mobile bottom-sheet
    // Modal's `h-(--visual-viewport-height)`) live in the component
    // packages themselves (@heroui/modal, @heroui/overlays, ...), not in
    // the theme package's tailwind-variants definitions. Missing them left
    // those classes ungenerated, so the affected elements silently fell
    // back to an unstyled/mispositioned height.
    './node_modules/@heroui/**/dist/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  darkMode: 'class',
  plugins: [
    heroui({
      themes: {
        light: {
          colors: {
            // Note: `primary` here is only a fallback/base — it seeds the
            // auto-generated primary-50..900 shade scale and renders briefly
            // before hydration. The color users actually see for primary
            // buttons/links is set at runtime by ThemeWrapper.tsx, which
            // overrides the --heroui-primary CSS variable with the user's
            // chosen accent color (default '#6366f1') for BOTH light and
            // dark mode alike. We keep a single shared value here (matching
            // that same runtime default) instead of two different unused
            // blues, so this fallback never visibly contradicts the real
            // rendered color.
            primary: {
              DEFAULT: '#6366f1',
              foreground: '#ffffff',
            },
            secondary: {
              DEFAULT: '#7B1E30',
              foreground: '#ffffff',
            },
            background: '#FAFAFA',
            content1: '#FFFFFF',
            content2: '#F8F9FA',
            content3: '#F1F5F9',
            danger: { DEFAULT: '#EF4444', foreground: '#ffffff' },
            // Darkened from the HeroUI/brand defaults (#10B981 / #F59E0B):
            // those pass fine as fills/icons but fail WCAG contrast as text
            // color on a white/content1 card (2.5:1 / 2.2:1 measured). These
            // shades hit ~7.7:1 and ~9:1 against white, both for the text
            // itself and for white text placed on a solid success/warning
            // fill. Only overriding DEFAULT/foreground — the 50-900 shade
            // scale used elsewhere for badges/backgrounds is untouched.
            success: { DEFAULT: '#065f46', foreground: '#ffffff' },
            warning: { DEFAULT: '#78350f', foreground: '#ffffff' },
            focus: '#1d4ed8',
          },
        },
        dark: {
          colors: {
            // See light theme comment: same fallback value, ThemeWrapper
            // always wins at runtime for both modes.
            primary: {
              DEFAULT: '#6366f1',
              foreground: '#ffffff',
            },
            secondary: {
              DEFAULT: '#7B1E30',
              foreground: '#ffffff',
            },
            background: '#0F172A',
            content1: '#1E293B',
            content2: '#273548',
            content3: '#334155',
            danger: { DEFAULT: '#EF4444', foreground: '#ffffff' },
            // Dark-mode success/warning text-on-card contrast already
            // measured at 5.8:1 / 6.8:1 (passes AA, close to AAA) — left
            // as-is rather than risking a mismatch with light mode's fix.
            success: { DEFAULT: '#10B981', foreground: '#ffffff' },
            warning: { DEFAULT: '#F59E0B', foreground: '#ffffff' },
            // HeroUI's default focus ring (#006FEE) measured under 4.5:1
            // against both content1 and background in dark mode. Lighter
            // blue restores a ≥4.5:1 keyboard-focus indicator.
            focus: '#93c5fd',
          },
        },
      },
    }),
  ],
};

export default config;
