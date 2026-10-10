import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // ISSUE_077: design.md asks for colocated tests, but the API groups them
    // under tests/ instead — a mismatch on both sides. Rather than move 26
    // files for no behavioral gain, the code side of the fix is this: widen
    // discovery so a src/**/*.test.ts written by mistake (following the old
    // doc) still runs instead of being silently ignored by CI.
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
    },
  },
});
