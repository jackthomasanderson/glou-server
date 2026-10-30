import { Request, Response, NextFunction } from 'express';
import { redactUrlSecrets } from '../lib/log-redact';

/**
 * CSRF protection for a cookie-authenticated API.
 *
 * Every auth cookie this server sets is already `SameSite=Strict`, which stops
 * a cross-site page from attaching them to a forged request in every current
 * browser. This middleware is the second layer, for the cases SameSite alone
 * doesn't cover (older browsers, some embedded webviews, and sibling
 * subdomains: `SameSite` cookies still go along with a request from
 * `photos.home.example` to `glou.home.example`, both being the same "site"):
 *
 *  1. Fetch Metadata (`Sec-Fetch-Site`) — sent automatically by all current
 *     browsers and impossible for page JavaScript to forge. The first-party
 *     web app (proxied through Next's `/api` rewrite) carries `same-origin`
 *     and passes; `cross-site` is rejected. `same-site` means another app under
 *     the same domain, so it only passes when its `Origin` is trusted (2 or 3).
 *  2. `Origin` allow-list — `APP_URL`, `CORS_ORIGIN`, `CSRF_TRUSTED_ORIGINS`.
 *     Also the fallback for a request with an `Origin` but no `Sec-Fetch-Site`.
 *
 *  3. Same host — `Origin` equal to the host the request was addressed to
 *     (`Host`, or `X-Forwarded-Host` which Next's `/api` proxy always sets).
 *     Browsers only send Fetch Metadata to secure contexts (https, localhost),
 *     so a NAS reached at `http://192.168.1.20:3000` gets none of it, and its
 *     `Origin` is not `APP_URL` unless the operator set it (#247: first account
 *     could not be created). A cross-site page cannot make its `Origin` equal
 *     the victim's host, and cannot set `X-Forwarded-Host` without a CORS
 *     preflight, which `cors` rejects.
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

// `none` is a direct address-bar hit. `same-site` is deliberately absent: any
// sibling subdomain qualifies, so it must also carry a trusted `Origin`.
const ALLOWED_FETCH_SITES = new Set(['same-origin', 'none']);

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

/** True when `origin`'s host[:port] is the host this request was addressed to. */
function isSameHost(origin: string, req: Request): boolean {
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const hosts = [req.get('x-forwarded-host'), req.get('host')]
    .filter((h): h is string => !!h)
    .flatMap((h) => h.split(','))
    .map((h) => h.trim().toLowerCase());
  return hosts.includes(originHost);
}

/** `Origin` is listed in the configuration, or is the host the request was sent to. */
function isTrustedOrigin(origin: string, req: Request): boolean {
  return allowedOrigins().has(origin.replace(/\/$/, '')) || isSameHost(origin, req);
}

function rejectOrigin(req: Request, res: Response, origin: string | undefined): void {
  // Say why: this used to be a silent 403 shown as "unexpected error", with
  // nothing in the logs to explain it.
  // Constant format string: method, URL and Origin are request-controlled and
  // must not be read as console placeholders (see error.middleware). The URL
  // goes through redactUrlSecrets: guest share links carry their token (#612).
  console.warn(
    '[csrf] Rejected %s %s: Origin %s is not APP_URL / CORS_ORIGIN / CSRF_TRUSTED_ORIGINS' +
      ' and does not match the host it was sent to. Set APP_URL to the address you use in the browser.',
    req.method,
    redactUrlSecrets(req.originalUrl),
    origin ?? '(none)',
  );
  res.status(403).json({ error: 'CSRF_ORIGIN_REJECTED' });
}

export function csrfGuard(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const fetchSite = req.get('sec-fetch-site');
  const origin = req.get('origin');

  if (fetchSite) {
    if (ALLOWED_FETCH_SITES.has(fetchSite)) {
      next();
      return;
    }
    // #600: another app under the same domain (`same-site`) is only trusted
    // when its Origin is; browsers always send one on state-changing requests.
    if (fetchSite === 'same-site') {
      if (origin && isTrustedOrigin(origin, req)) {
        next();
        return;
      }
      rejectOrigin(req, res, origin);
      return;
    }
    res.status(403).json({ error: 'CSRF_CROSS_SITE_REJECTED' });
    return;
  }

  if (origin) {
    if (isTrustedOrigin(origin, req)) {
      next();
      return;
    }
    rejectOrigin(req, res, origin);
    return;
  }

  // No Fetch Metadata and no Origin: not a browser page context.
  next();
}
