import type { Config } from 'tailwindcss';
import { heroui } from '@heroui/react';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}',
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
            primary: {
              DEFAULT: '#2563EB',
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
            success: { DEFAULT: '#10B981', foreground: '#ffffff' },
            warning: { DEFAULT: '#F59E0B', foreground: '#ffffff' },
          },
        },
        dark: {
          colors: {
            primary: {
              DEFAULT: '#3B82F6',
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
            success: { DEFAULT: '#10B981', foreground: '#ffffff' },
            warning: { DEFAULT: '#F59E0B', foreground: '#ffffff' },
          },
        },
      },
    }),
  ],
};

export default config;
