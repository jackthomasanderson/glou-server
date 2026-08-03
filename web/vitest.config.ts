import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
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
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
    exclude: ['node_modules', '.next'],
  },
});
