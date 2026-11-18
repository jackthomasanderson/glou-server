import { AUTH_RATE_LIMIT_WINDOW_MINUTES, TOO_MANY_REQUESTS_ERROR } from '@shared/auth';
import { NetworkError } from '@/lib/network-error';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** The request never got an answer: offline, server down, or timed out. */
export function isNetworkFailure(err: unknown): boolean {
  return err instanceof NetworkError
    || (err as { name?: unknown } | null)?.name === 'TimeoutError'
    || (err instanceof Error && err.message === 'NETWORK_ERROR');
}

/**
 * The server answered 503: its database is restarting, or a proxy says the
 * API is down for a moment (#467). Nothing is lost; trying again soon works.
 */
export function isServerUnavailable(err: unknown): boolean {
  return (err as { status?: unknown } | null)?.status === 503
    || (err instanceof Error && err.message === 'DATABASE_UNAVAILABLE');
}

/**
 * The server (or a proxy) answered 429: too many requests from this address.
 * The server is reachable, so this is never a connection problem (#1039).
 */
export function isRateLimited(err: unknown): boolean {
  return (err as { status?: unknown } | null)?.status === 429
    || (err instanceof Error && err.message === TOO_MANY_REQUESTS_ERROR);
}

/** Up to this many seconds the wait is said in seconds, beyond it in whole minutes. */
const SECONDS_UNTIL_MINUTES = 90;
/** A wait longer than a day is not believable (a proxy's timestamp, garbage): said as "in a moment". */
const MAX_WAIT_SECONDS = 24 * 60 * 60;

/**
 * What to tell a member whose request was throttled: the i18n key and its
 * values. "Try again in N seconds/minutes" when the server said how long
 * (`Retry-After`, `RateLimit-Reset`), "in a moment" when it did not (#1039).
 */
export function rateLimitedNotice(err: unknown): { key: string; values?: { count: number } } {
  const seconds = (err as { retryAfter?: unknown } | null)?.retryAfter;
  if (typeof seconds !== 'number' || !(seconds > 0) || seconds > MAX_WAIT_SECONDS) return { key: 'status.rateLimited' };
  return seconds <= SECONDS_UNTIL_MINUTES
    ? { key: 'status.rateLimitedSeconds', values: { count: Math.ceil(seconds) } }
    : { key: 'status.rateLimitedMinutes', values: { count: Math.ceil(seconds / 60) } };
}

/** A page-level load failure in words: throttled, server restarting, or the screen's own `fallback` (#467, #1039). */
export function loadErrorMessage(t: Translate, err: unknown, fallback: string): string {
  if (isRateLimited(err)) {
    const { key, values } = rateLimitedNotice(err);
    return t(key, values);
  }
  return isServerUnavailable(err) ? t('status.serverUnavailable') : fallback;
}

/** Whole minutes left before a throttled form accepts a new attempt (#640). */
export function minutesToWait(err: unknown): number {
  const seconds = (err as { retryAfter?: unknown } | null)?.retryAfter;
  return typeof seconds === 'number' && seconds > 0 ? Math.ceil(seconds / 60) : AUTH_RATE_LIMIT_WINDOW_MINUTES;
}

/**
 * Turns a failed sign-in, 2FA, password-reset or unlock request into a
 * sentence in the member's language — never a raw code (#652), and "wait N
 * minutes" rather than "try again" when the form is throttled (#640).
 *
 * `keyPrefix`: where this screen's codes are translated; its
 * `UNEXPECTED_ERROR` is the fallback for a code it does not know.
 */
export function authErrorMessage(t: Translate, err: unknown, keyPrefix = 'auth.errors'): string {
  if (isNetworkFailure(err)) return t('status.serverUnreachable');
  if (isServerUnavailable(err)) return t('status.serverUnavailable');
  const code = err instanceof Error ? err.message : '';
  if (code === TOO_MANY_REQUESTS_ERROR) return t('auth.errors.TOO_MANY_REQUESTS', { count: minutesToWait(err) });
  const key = `${keyPrefix}.${code}`;
  const translated = code ? t(key) : key;
  return translated === key ? t(`${keyPrefix}.UNEXPECTED_ERROR`) : translated;
}
