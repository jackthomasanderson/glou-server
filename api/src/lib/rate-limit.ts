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
