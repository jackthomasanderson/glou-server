import { Request, Response, NextFunction } from 'express';

/**
 * CSRF protection for a cookie-authenticated API.
 *
 * Every auth cookie this server sets is already `SameSite=Strict`, which stops
 * a cross-site page from attaching them to a forged request in every current
 * browser. This middleware is the second layer, for the cases SameSite alone
 * doesn't cover (older browsers, some embedded webviews, and sibling-subdomain
 * cookie shadowing):
 *
 *  1. Fetch Metadata (`Sec-Fetch-Site`) — sent automatically by all current
 *     browsers and impossible for page JavaScript to forge. A genuine
 *     cross-origin attacker request carries `Sec-Fetch-Site: cross-site`; the
 *     first-party web app (same-origin, proxied through Next's `/api` rewrite)
 *     carries `same-origin`.
 *  2. `Origin` allow-list fallback — for the rare request that reaches us with
 *     an `Origin` but no `Sec-Fetch-Site`.
 *
 * Requests with neither header are non-browser clients (curl, a native app,
 * server-to-server, the test suite) — not a CSRF vector — and pass through.
 * Safe methods (GET/HEAD/OPTIONS) are never state-changing and are exempt.
 *
 * Deliberately fail-open when it can't tell: the goal is to block the clear
 * cross-site case without risking a self-hosted deployment whose reverse proxy
 * happens to strip these headers.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Same-site covers a deployment serving the web app and API from two
// subdomains of one registrable domain; `none` is a direct address-bar hit.
const ALLOWED_FETCH_SITES = new Set(['same-origin', 'same-site', 'none']);

function allowedOrigins(): Set<string> {
  const raw = [
    process.env.CSRF_TRUSTED_ORIGINS,
    process.env.CORS_ORIGIN,
    process.env.APP_URL,
  ]
    .filter((v): v is string => !!v && v.trim() !== '')
    .flatMap((v) => v.split(','))
    .map((v) => v.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return new Set(raw);
}

export function csrfGuard(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const fetchSite = req.get('sec-fetch-site');
  if (fetchSite) {
    if (ALLOWED_FETCH_SITES.has(fetchSite)) {
      next();
      return;
    }
    res.status(403).json({ error: 'CSRF_CROSS_SITE_REJECTED' });
    return;
  }

  const origin = req.get('origin');
  if (origin) {
    if (allowedOrigins().has(origin.replace(/\/$/, ''))) {
      next();
      return;
    }
    res.status(403).json({ error: 'CSRF_ORIGIN_REJECTED' });
    return;
  }

  // No Fetch Metadata and no Origin: not a browser page context.
  next();
}
