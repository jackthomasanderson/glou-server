import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // @vitejs/plugin-react was already a devDependency but never wired up —
  // needed to transform .tsx test files (JSX in component tests below).
  plugins: [react()],
  // Mirrors tsconfig.json's "@/*" -> "./*" path mapping. Without this,
  // vitest (unlike Next.js's own webpack/SWC build) cannot resolve the "@/"
  // imports used throughout web/lib and web/components, which meant no
  // colocated test could import any module using that alias — including
  // this pass's web/lib/analytics/mapFilters.ts. Added here as a minimal,
  // additive fix (test resolution only, no runtime/build impact).
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    // jsdom (added as a devDependency alongside this change) provides a DOM
    // for component tests (see components/ui/__tests__/ThemeWrapper.test.tsx)
    // — a strict superset of what the existing plain-function tests need, so
    // this is safe as the single global environment.
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: [
      '**/__tests__/**/*.test.ts',
      '**/__tests__/**/*.test.tsx',
      '**/*.test.ts',
      '**/*.test.tsx',
    ],
    exclude: ['node_modules', '.next', 'e2e/**'],
  },
});
