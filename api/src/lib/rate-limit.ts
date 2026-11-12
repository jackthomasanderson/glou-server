import crypto from 'crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import rateLimit, { type Options, type RateLimitRequestHandler } from 'express-rate-limit';
import {
  AUTH_RATE_LIMIT_WINDOW_MINUTES,
  TOO_MANY_REQUESTS_ERROR,
  type TooManyRequestsBody,
} from '../../../shared/auth';

/**
 * #640: express-rate-limit answers a plain-text 429 by default, which the web
 * cannot read: members saw "unexpected error, try again" and kept trying,
 * extending the block. This answers the stable code and how long to wait.
 * The library has already set `Retry-After` (seconds) when it calls this.
 */
export function sendTooManyRequests(_req: Request, res: Response, _next: NextFunction, options: Options): void {
  const header = Number(res.getHeader('Retry-After'));
  const retryAfter = Number.isFinite(header) && header > 0 ? header : Math.ceil(options.windowMs / 1000);
  const body: TooManyRequestsBody = { error: TOO_MANY_REQUESTS_ERROR, retryAfter };
  res.status(options.statusCode).json(body);
}

/**
 * A limiter for the sign-in, sign-up, 2FA, password-reset and unlock forms:
 * `max` attempts per IP over the auth window. `skipSuccessfulRequests` counts
 * only refused attempts (a household unlocking the same tablet all day).
 */
export function authRateLimit(max: number, { skipSuccessfulRequests = false }: { skipSuccessfulRequests?: boolean } = {}): RateLimitRequestHandler {
  return rateLimit({
    windowMs: AUTH_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    handler: sendTooManyRequests,
  });
}

/**
 * #606: the refusals that mean "this password (or code) is wrong". Only they
 * spend an account's budget: a form refused for another reason (e-mail
 * already used, last admin, a missing field, a step-up asked without any
 * password) is not a guess.
 */
const WRONG_SECRET_CODES: ReadonlySet<string> = new Set(['INVALID_CREDENTIALS', 'INVALID_PASSWORD', 'INVALID_CODE', 'INVALID_TOTP_CODE']);

/** Keeps the `error` code a route answers, for the limiter to read once the response is sent. */
function rememberErrorCode(_req: Request, res: Response, next: NextFunction): void {
  const json = res.json.bind(res);
  res.json = (body?: unknown) => {
    const error = (body as { error?: unknown } | null)?.error;
    if (typeof error === 'string') res.locals.errorCode = error;
    return json(body);
  };
  next();
}

/**
 * #606: `max` wrong passwords or codes per signed-in account over the auth
 * window, whatever the address they come from (an IP limit alone is
 * sidestepped by rotating addresses, or by a forged X-Forwarded-For on an
 * instance with no proxy in front). Keyed on the account, so it goes after
 * authMiddleware. `scope` names the budget: routes given the same instance
 * share it.
 */
export function accountRateLimit(max: number, scope: string): RequestHandler[] {
  return [
    rememberErrorCode,
    rateLimit({
      windowMs: AUTH_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      requestWasSuccessful: (_req, res) => !WRONG_SECRET_CODES.has(String(res.locals.errorCode)),
      keyGenerator: (req) => `${scope}:${req.userId}`,
      handler: sendTooManyRequests,
    }),
  ];
}

/** #606: wrong passwords a signed-in account may submit per auth window. */
export const PASSWORD_CHECK_MAX = 10;

/**
 * #606: one budget per account, shared by the member routes that check the
 * account's own password or 2FA code (password, e-mail, PIN, trusted device,
 * 2FA, account deletion). One instance, so those routes share the count.
 */
export const passwordCheckLimiter = accountRateLimit(PASSWORD_CHECK_MAX, 'password');

/**
 * #606 (review): unlocking the app has a budget of its own, so whoever burns
 * the shared one cannot keep the owner from unlocking their own device.
 */
export const unlockAccountLimiter = accountRateLimit(PASSWORD_CHECK_MAX, 'unlock');

/** #914: wrong passwords one sign-in identifier may take per auth window. */
export const SIGN_IN_FAILURES_MAX = 10;

/**
 * #980/#988: proof that the sign-in comes from a device or browser of the
 * account the identifier names, as resolved by the route before the limiters
 * run (`res.locals.signInProof`): `device:<trusted device id>` for a valid
 * trusted-device cookie (#980), `browser:<known browser id>` for a valid
 * known-browser cookie (#988). Unset without one.
 */
function signInProof(res: Response): string | undefined {
  const proof: unknown = res.locals.signInProof;
  return typeof proof === 'string' && proof ? proof : undefined;
}

function signInIdentifier(req: Request): string | undefined {
  const identifier = (req.body as { identifier?: unknown } | undefined)?.identifier;
  return typeof identifier === 'string' ? identifier : undefined;
}

/**
 * #980: calls `onLocked` once per budget window and key, however many
 * requests the window refuses, so a stranger renewing a lock writes one audit
 * row every window rather than one per guess.
 */
function oncePerWindow(windowMs: number, onLocked: (req: Request) => void): (req: Request, key: string) => void {
  const reported = new Map<string, number>();
  return (req, key) => {
    const now = Date.now();
    const windowEnd = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime?.getTime()
      ?? (Math.floor(now / windowMs) + 1) * windowMs;
    for (const [k, end] of reported) if (end <= now) reported.delete(k);
    if (reported.get(key) === windowEnd) return;
    reported.set(key, windowEnd);
    onLocked(req);
  };
}

/**
 * #914: wrong passwords at sign-in, counted per identifier typed (username or
 * e-mail, exactly as the account lookup compares it) whatever the address
 * they come from, so forging X-Forwarded-For no longer buys fresh guesses.
 *
 * - Keyed on what was typed, not on the account found: an unknown identifier
 *   is counted and refused exactly like an existing one (#607), and the
 *   limit cannot tell whether a username and an e-mail are the same account.
 *   An account thus has two budgets (its username and its e-mail).
 * - Checked before the password is compared: once spent, even the right
 *   password gets 429, so the budget is not a guessing oracle.
 * - A successful sign-in is not counted and resets nothing.
 * - Its own budget: an anonymous stranger spending it cannot keep the member
 *   from the password checks of their open session ({@link passwordCheckLimiter}).
 * - Fixed window: the refusal lifts at the end of the window, never for good.
 *
 * #980: a stranger who knows a username could renew that lock every window
 * and keep the member out for good. So:
 * - A sign-in from a trusted device (#980) or a known browser (#988) of that
 *   very account (see {@link signInProof}) skips the identifier's budget:
 *   the cookie proves a past sign-in there, which a stranger does not have.
 *   Its wrong passwords are counted on a budget of that device or browser
 *   instead, so a stolen cookie buys no more guesses than the identifier
 *   gives; only the cookie's holder can spend it. The per-address limiter
 *   still applies.
 * - The first refusal of each window is reported through `onLocked`, for the
 *   route to file under the account (one row per window, not per guess).
 */
export function signInAccountLimiter(onLocked: (identifier: string, req: Request) => void): RequestHandler[] {
  const windowMs = AUTH_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;
  // Hashed so the store keeps a fixed-size key, whatever was typed.
  const identifierKey = (req: Request) => `sign-in:${crypto.createHash('sha256').update(signInIdentifier(req) ?? '').digest('hex')}`;
  const reportLock = oncePerWindow(windowMs, (req) => onLocked(signInIdentifier(req) ?? '', req));
  const countsAsGuess = (_req: Request, res: Response) => !WRONG_SECRET_CODES.has(String(res.locals.errorCode));
  return [
    rememberErrorCode,
    rateLimit({
      windowMs,
      max: SIGN_IN_FAILURES_MAX,
      // No RateLimit-* headers: they would tell anyone how many recent wrong
      // passwords an identifier has, and overwrite the per-address ones.
      standardHeaders: false,
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      requestWasSuccessful: countsAsGuess,
      // A malformed body is refused by the route's validation; nothing to count.
      // #980/#988: a trusted device or known browser of the account has its own budget below.
      skip: (req, res) => signInIdentifier(req) === undefined || signInProof(res) !== undefined,
      keyGenerator: identifierKey,
      handler: (req, res, next, options) => {
        reportLock(req, identifierKey(req));
        sendTooManyRequests(req, res, next, options);
      },
    }),
    // #980/#988: wrong passwords sent with a trusted-device or known-browser
    // cookie, per device or browser.
    rateLimit({
      windowMs,
      max: SIGN_IN_FAILURES_MAX,
      standardHeaders: false,
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      requestWasSuccessful: countsAsGuess,
      skip: (_req, res) => signInProof(res) === undefined,
      keyGenerator: (_req, res) => `sign-in-proof:${signInProof(res)}`,
      handler: sendTooManyRequests,
    }),
  ];
}

/**
 * `max` requests per signed-in account over the auth window, whatever their
 * outcome: for an action that reaches someone else each time it succeeds
 * (#767: a member's notification test lands in the administrator's shared
 * Gotify app). Keyed on the account like {@link accountRateLimit}, so it goes
 * after authMiddleware.
 */
export function accountRequestLimit(max: number, scope: string): RateLimitRequestHandler {
  return rateLimit({
    windowMs: AUTH_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${scope}:${req.userId}`,
    handler: sendTooManyRequests,
  });
}
