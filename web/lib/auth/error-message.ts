import { AUTH_RATE_LIMIT_WINDOW_MINUTES, TOO_MANY_REQUESTS_ERROR } from '@shared/auth';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** The request never got an answer: offline, server down, or timed out. */
function isNetworkFailure(err: unknown): boolean {
  const name = (err as { name?: unknown } | null)?.name;
  return err instanceof TypeError || name === 'AbortError' || name === 'TimeoutError'
    || (err instanceof Error && err.message === 'NETWORK_ERROR');
}

/** Whole minutes left before a throttled form accepts a new attempt (#640). */
function minutesToWait(err: unknown): number {
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
  const code = err instanceof Error ? err.message : '';
  if (code === TOO_MANY_REQUESTS_ERROR) return t('auth.errors.TOO_MANY_REQUESTS', { count: minutesToWait(err) });
  const key = `${keyPrefix}.${code}`;
  const translated = code ? t(key) : key;
  return translated === key ? t(`${keyPrefix}.UNEXPECTED_ERROR`) : translated;
}
