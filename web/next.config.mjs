import withPWAInit from '@ducanh2912/next-pwa';

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
const withPWA = withPWAInit({
  dest: 'public',
  // Standard next-pwa pattern: no service worker at all in dev, so a stale
  // cached worker can never mask local changes during `next dev`.
  disable: process.env.NODE_ENV === 'development',
  register: true,
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    runtimeCaching: [
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
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  serverExternalPackages: [],
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    return [
      { source: '/api/:path*', destination: `${apiBase}/api/:path*` },
      { source: '/uploads/:path*', destination: `${apiBase}/uploads/:path*` },
    ];
  },
};

export default withPWA(nextConfig);
