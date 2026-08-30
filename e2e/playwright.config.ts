import { defineConfig, devices } from '@playwright/test';

/**
 * The stack under test is expected to be ALREADY RUNNING (docker-compose:
 * web on :3000, api on :3001) — there is no `webServer` block on purpose.
 *
 *   Local:  docker compose -f docker-compose.dev.yml up -d   (pulls :beta)
 *   CI:     docker compose -f docker-compose.e2e.yml up -d --build
 *
 * BASE_URL overrides the target (default http://localhost:3000).
 */
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }], ['list']] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    storageState: './.auth/user.json',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'on-first-retry' : 'off',
    // The app sets `Secure` cookies; browsers still accept those on
    // http://localhost, so no HTTPS is needed for local runs.
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
