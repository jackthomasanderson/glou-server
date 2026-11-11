import type { Config } from 'tailwindcss';
import { heroui } from '@heroui/react';
import { THEME_COLORS } from './lib/theme-colors';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    // HeroUI's own classes are not listed here: Tailwind 4 drops these globs
    // when a .gitignore lists node_modules. globals.css @sources them (#721).
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      // One stacking order for the whole page, lowest first (ISSUE_327, #574):
      //   ≤ 30   app chrome: sticky header, sidebar, bottom nav, floating buttons
      //   40     overlay: full-screen app layers (mobile search); the app's own
      //          fixed popups (undo bar, bulk-action bar, map tooltip) use z-40 too
      //   45     wizard: onboarding, above the app...
      //   50     ...but under HeroUI Modal/Drawer (rendered in <body>): the add
      //          form and the scan opened from the wizard must show on top
      //   100    HeroUI toast region: errors raised in the wizard stay visible
      //   9999   lock: lock screen / forced password change, above everything,
      //          an open window and its toasts included
      // react-aria places popovers (Select, Autocomplete lists) at 100000 inline.
      // The order is checked by tailwind.config.test.ts.
      zIndex: {
        overlay: '40',
        wizard: '45',
        lock: '9999',
      },
    },
  },
  darkMode: 'class',
  plugins: [
    heroui({
      // Colours and their contrast checks: lib/theme-colors.ts (#648).
      // ThemeWrapper replaces `primary` with the user's accent preset.
      themes: {
        light: { colors: THEME_COLORS.light },
        dark: { colors: THEME_COLORS.dark },
      },
    }),
  ],
};

export default config;
