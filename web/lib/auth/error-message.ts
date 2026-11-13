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
