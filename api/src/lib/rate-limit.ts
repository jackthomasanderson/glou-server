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

/** A limiter for the sign-in, sign-up, 2FA, password-reset and unlock forms: `max` attempts per IP over the auth window. */
export function authRateLimit(max: number): RateLimitRequestHandler {
  return rateLimit({
    windowMs: AUTH_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: sendTooManyRequests,
  });
}
