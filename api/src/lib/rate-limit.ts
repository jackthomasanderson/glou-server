import type { NextFunction, Request, Response } from 'express';
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

/** #606: wrong passwords a signed-in account may submit per auth window. */
export const PASSWORD_CHECK_MAX = 10;

/**
 * #606: one budget per account, shared by every route that checks the
 * password of a signed-in account (password, e-mail, PIN, trusted device,
 * 2FA, unlock, account deletion). Those routes used to sit under the global
 * limiter only: a stolen session could try passwords by the thousand, from
 * as many addresses as it liked. Keyed on the account, so it must come after
 * authMiddleware; only refusals count. A single instance, so the routes
 * share the count.
 */
export const passwordCheckLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: PASSWORD_CHECK_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `user:${req.userId}`,
  handler: sendTooManyRequests,
});
