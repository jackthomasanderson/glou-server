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
    // Before login the app follows the browser language (#344); the suite
    // asserts on the French interface.
    locale: 'fr-FR',
    storageState: './.auth/user.json',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'on-first-retry' : 'off',
    // The app sets `Secure` cookies; browsers still accept those on
    // http://localhost, so no HTTPS is needed for local runs.
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // ISSUE_399: the app targets phones first, but CI only ever ran on
    // desktop Chrome — mobile-specific behaviour (viewport, touch,
    // Safari's quirks) had no coverage at all. Scoped to the single
    // deterministic "main user journey" spec (ux-ui.md 6.1 — see
    // add-bottle.spec.ts) rather than the full suite: the goal is a smoke
    // check that the core flow still works on a phone-sized viewport in
    // both engines, not to triple the whole suite's CI time. The first-run
    // wizard (#574) joins it: a new member's very first minute, where
    // windows become full-screen sheets on a phone.
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      testMatch: /(add-bottle|onboarding-wizard)\.spec\.ts/,
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14'] },
      testMatch: /(add-bottle|onboarding-wizard)\.spec\.ts/,
    },
  ],
});
