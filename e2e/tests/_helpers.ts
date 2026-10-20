import { readFileSync } from 'node:fs';
import type { Page, TestInfo } from '@playwright/test';
import { CREDS_FILE, type E2ECreds } from '../global-setup';

export function creds(): E2ECreds {
  return JSON.parse(readFileSync(CREDS_FILE, 'utf8')) as E2ECreds;
}

/**
 * ISSUE_434: the sidebar's single "bottles" entry became 3 category
 * shortcuts (`/bottles?category=wine|sparkling|spirit`) — rendered as
 * `<a role="button" href="/bottles?category=...">`, so neither
 * `getByRole('link')` nor `getByRole('button', { name })` is reliable.
 * Matching on the `/bottles` href prefix (not an exact match) still means
 * the authenticated app shell has mounted, regardless of which category
 * shortcut happens to render first.
 */
export function bottlesNavLink(page: Page) {
  return page.locator('a[href^="/bottles"]').first();
}

/** The authenticated app routes worth smoke-testing / fuzzing. */
export const APP_ROUTES = [
  '/bottles',
  '/cigars',
  '/collections',
  '/cellars',
  '/cellar-journal',
  '/analytics-terroirs',
  '/wishlist-budget',
  '/inventory-count',
  '/profile',
] as const;

/**
 * Attaches listeners that fail the test on an uncaught page exception or a
 * console.error, and records server 5xx responses. Returns a getter for the
 * collected problems so a spec can assert on them explicitly.
 */
export function collectPageProblems(page: Page, testInfo: TestInfo) {
  const problems: string[] = [];

  page.on('pageerror', (err) => {
    problems.push(`[pageerror] ${err.message}`);
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // Known-noisy, not app bugs: favicon/asset 404s, HMR, extension chatter.
    if (/favicon|Failed to load resource|net::ERR_|\[HMR\]|Download the React DevTools/i.test(text)) return;
    problems.push(`[console.error] ${text}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 500) problems.push(`[${res.status()}] ${res.request().method()} ${res.url()}`);
  });

  return {
    get: () => problems,
    async dump() {
      if (problems.length) {
        await testInfo.attach('page-problems', { body: problems.join('\n'), contentType: 'text/plain' });
      }
    },
  };
}
