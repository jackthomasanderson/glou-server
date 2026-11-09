import path from 'node:path';
import withPWAInit from '@ducanh2912/next-pwa';
// Default import of the CommonJS module: named-export detection of Next's
// compiled CJS is not guaranteed.
import nextConstants from 'next/constants.js';
import { localesVersion } from './lib/locales-version.mjs';

// #471 (recette v2): fingerprint of the translation files, put in the URL
// lib/i18n.ts fetches them from — see lib/locales-version.mjs.
const LOCALES_VERSION = localesVersion(path.join(import.meta.dirname, 'public', 'locales'));

// IMPORTANT: Next.js 16 defaults to Turbopack, which does not run webpack
// plugins — @ducanh2912/next-pwa generates the service worker via a Workbox
// *webpack* plugin, so under plain Turbopack the SW would either fail to
// build (hard error, no turbopack config present) or, if silenced with an
// empty `turbopack: {}`, silently never emit sw.js at all. The production
// build is therefore forced back onto webpack via `next build --webpack`
// in package.json's "build" script (see CI run #146 for the Turbopack
// failure this fixes). `next dev` is unaffected: the PWA plugin is fully
// disabled below in development, so there is no webpack config to conflict
// with Turbopack there.

// ─── PWA / Service Worker (FEAT-16 & FEAT-23 — merged offline-first spec) ───
// Scope is deliberately bounded: offline support covers CONSULTING the
// already-loaded inventory and the common inventory mutations queued via
// web/lib/offline/syncEngine.ts (edit a field, mark consumed/opened — the
// existing FEAT-77 flow). The rest of the app (map, wishlist, onboarding
// wizard, CSV import...) is intentionally left online-only — see
// .vibe/features/wip/FEAT-16/feature.md and FEAT-23/feature.md.
//
// Caching strategy — deliberately conservative, never CacheFirst for data:
//  - `extendDefaultRuntimeCaching: true` keeps @ducanh2912/next-pwa's built-in
//    rules: content-hashed `/_next/static/*.js|css` → CacheFirst is safe
//    there because a new deploy always emits new hashed filenames (no
//    "stuck on old build" risk); fonts/images get StaleWhileRevalidate; and
//    every other same-origin GET (including any /api/* route not listed
//    below, and page navigations) falls back to NetworkFirst.
//  - The one custom entry below overrides GET /api/inventory, /api/cellars
//    and /api/collections with a dedicated, shorter-lived NetworkFirst
//    cache: for a shared multi-user inventory, freshness matters more than
//    raw availability, so the network is always tried first and the cache
//    is only a fallback when the network request fails or times out.
//  - Workbox route matching defaults to GET-only per entry, and this entry
//    also sets `method: 'GET'` explicitly as a second guard — so
//    POST/PATCH/PUT/DELETE are never intercepted or cached by the service
//    worker. Mutations always hit the network directly; they are queued
//    client-side in IndexedDB (see web/lib/offline/syncEngine.ts) only when
//    that direct request actually fails.
/** @type {import('@ducanh2912/next-pwa').PluginOptions} */
export const pwaOptions = {
  dest: 'public',
  // Standard next-pwa pattern: no service worker at all in dev, so a stale
  // cached worker can never mask local changes during `next dev`.
  disable: process.env.NODE_ENV === 'development',
  register: true,
  // #471 (recette v2): everything in public/ is precached by default, served
  // cache-first by the worker that precached it — including the translations,
  // so the first visit after an update got the previous version's file (raw
  // keys, old labels). They are left out of the precache (the plugin's own
  // `noprecache/` exclusion is kept) and served by the `glou-locales` rule
  // below instead.
  publicExcludes: ['!noprecache/**/*', '!locales/**/*'],
  // FEAT-108 (ux-ui.md §10.8): back online, the page is NOT reloaded (the
  // plugin's default). The app follows by itself — the offline queue is
  // replayed (useOfflineSync) and the lists refetched — so the open drawer
  // stays where it was, and a reload can no longer cut a queued change
  // while it is being sent (its answer lost, then replayed as a conflict).
  reloadOnOnline: false,
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    // Review of #828: the translations of THIS version, both languages, at
    // their fingerprinted URL (lib/i18n.ts). Installed with the rest of the
    // app, they are there offline from the first start after an update, and
    // for the other language too. A new version means new URLs: no revision.
    additionalManifestEntries: ['fr', 'en'].map((lng) => ({
      url: `/locales/${lng}/common.json?v=${encodeURIComponent(LOCALES_VERSION)}`,
      revision: null,
    })),
    runtimeCaching: [
      // FEAT-108 (review of #823): the connectivity probe must never be
      // answered from a cache — the plugin's default `apis` rule
      // (NetworkFirst) would serve a stale `{ online: true }` to an app
      // started offline, and the actions that need the server would look
      // available. Listed first: the first matching rule wins.
      {
        urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname === '/api/connectivity',
        method: 'GET',
        handler: 'NetworkOnly',
      },
      // #471 (recette v2): the translations, at their fingerprinted URL
      // (lib/i18n.ts). Network first so a page always gets the file of its
      // own version; the copy kept is what an app started offline reads
      // (FEAT-108: translations stay available offline after a first visit).
      // Needed as its own rule: the plugin's `.json` rule ends with `$` and
      // does not match a URL with a query string.
      {
        urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/locales/'),
        method: 'GET',
        handler: 'NetworkFirst',
        options: {
          cacheName: 'glou-locales',
          networkTimeoutSeconds: 4,
          expiration: { maxEntries: 8 },
          cacheableResponse: { statuses: [200] },
        },
      },
      {
        urlPattern: ({ url, sameOrigin }) =>
          sameOrigin && /^\/api\/(inventory|cellars|collections)(\/|$)/.test(url.pathname),
        method: 'GET',
        handler: 'NetworkFirst',
        options: {
          cacheName: 'glou-inventory-data',
          networkTimeoutSeconds: 4,
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 60 * 60 * 24, // 24h safety ceiling — NetworkFirst keeps it fresh whenever online
          },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],
  },
};
const withPWA = withPWAInit(pwaOptions);

// ISSUE_053: Strict-Transport-Security tells the browser to only ever speak
// HTTPS to this origin — correct advice on an instance actually served over
// TLS, but a self-inflicted lockout on the http://, local-network deployment
// this project also explicitly supports (FEAT-54). Same override pattern as
// the API's `api/src/lib/cookie-secure.ts` (COOKIE_SECURE / APP_URL):
//   FORCE_HSTS=true|false  explicit override (e.g. TLS terminated upstream
//                          while APP_URL still says http, or the reverse)
//   otherwise              HSTS only when APP_URL is an https:// URL
function shouldSendHsts() {
  const override = process.env.FORCE_HSTS?.trim().toLowerCase();
  if (override === 'true') return true;
  if (override === 'false') return false;
  return process.env.APP_URL?.trim().startsWith('https://') ?? false;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_LOCALES_VERSION: LOCALES_VERSION },
  output: 'standalone',
  serverExternalPackages: [],
  // #466: the API↔web contracts live in ../shared (imported as @shared/*,
  // see tsconfig.json). webpack — the production build — only compiles
  // files inside web/ unless externalDir is on.
  experimental: {
    externalDir: true,
    // FEAT-91 (#641): the /api rewrite below cut every request at 30 s, long
    // before a CSV import's transaction budget (CSV_IMPORT_TRANSACTION_* in
    // shared/import.ts, 70 s in all): the screen reported a failure while the
    // import went on. Kept above that budget and at most the browser's own
    // wait (CONFIRM_TIMEOUT_MS) — lib/__tests__/import-timeouts.test.ts checks
    // both. Ordinary requests still give up at 15 s in the browser.
    proxyTimeout: 80_000,
  },
  // Private app: keep every page, guest-share links included, out of search
  // engines (#209). Paired with app/robots.ts, which crawlers may ignore.
  // ISSUE_053: the API's own `helmet()` only ever covers its JSON responses
  // and /uploads — the actual HTML pages are served by this Next.js app and
  // went out with none of this.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          // Clickjacking: an instance exposed to the Internet (FEAT-54) must
          // not be embeddable in a third party's invisible frame.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          ...(shouldSendHsts()
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
            : []),
        ],
      },
    ];
  },
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    return [
      { source: '/api/:path*', destination: `${apiBase}/api/:path*` },
      { source: '/uploads/:path*', destination: `${apiBase}/uploads/:path*` },
    ];
  },
  // ISSUE_425: the wishlist and analytics slugs only named part of their page
  // (the budget half, the terroir map half). Permanent redirects so a bookmark
  // or deep link made under an old slug keeps working. #502: /tastings is the
  // page again; browsers cached the old 308 /tastings -> /cellar-journal, so
  // /cellar-journal must NOT redirect back over HTTP (loop): see
  // app/cellar-journal/page.tsx.
  async redirects() {
    return [
      { source: '/wishlist', destination: '/wishlist-budget', permanent: true },
      { source: '/wishlist/:path*', destination: '/wishlist-budget/:path*', permanent: true },
      { source: '/analytics', destination: '/analytics-terroirs', permanent: true },
      { source: '/analytics/:path*', destination: '/analytics-terroirs/:path*', permanent: true },
    ];
  },
};

// #466: Turbopack (`next dev`) resolves nothing outside its root, which Next
// infers as web/ (the folder holding the lockfile); ../shared needs the
// repository root. Development only: Next forces outputFileTracingRoot to
// the same value, which in a production build would move the standalone
// server to .next/standalone/web/server.js and break web/Dockerfile.
export default function config(phase) {
  if (phase === nextConstants.PHASE_DEVELOPMENT_SERVER) {
    return withPWA({ ...nextConfig, turbopack: { root: path.join(import.meta.dirname, '..') } });
  }
  return withPWA(nextConfig);
}
