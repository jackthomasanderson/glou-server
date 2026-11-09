import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
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
  // #492: scoped to the visible navigation — the desktop sidebar, or the
  // bottom bar on a phone (the hidden one is left out by the role query).
  return page.getByRole('navigation').locator('a[href^="/bottles"]').first();
}

/** The authenticated app routes worth smoke-testing / fuzzing. */
export const APP_ROUTES = [
  '/bottles',
  '/cigars',
  '/collections',
  '/cellars',
  '/tastings',
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

/**
 * Recette #471 (lot RD point 3): every element matched shows its text whole —
 * not clipped nor cut by an ellipsis (its content is no wider than its box).
 */
export async function expectNotClipped(locator: Locator) {
  const clipped = await locator.evaluateAll((elements) =>
    elements.filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => element.textContent));
  expect(clipped).toEqual([]);
}
