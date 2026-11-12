import { TOO_MANY_REQUESTS_ERROR } from '@shared/auth';
import { SLOT_CHANGED, SLOT_CHOICE_REQUIRED, SLOTS_TO_FREE_REQUIRED } from '@shared/product';
import { fetchOrNetworkError } from './network-error';

type ApiErrorBody = { error?: unknown; retryAfter?: unknown; details?: unknown };

/**
 * A refusal from the API. `message` is the stable error code callers translate;
 * `retryAfter` (seconds) comes with TOO_MANY_REQUESTS (#640); `details`
 * with the refusals that ask a question back ({@link QUESTION_CODES}).
 */
export class ApiError extends Error {
  constructor(code: string, readonly status: number, readonly retryAfter?: number, readonly details?: unknown) {
    super(code);
    this.name = 'ApiError';
  }
}

function retryAfterHeader(res: Response): number | undefined {
  const seconds = Number(res.headers?.get('Retry-After'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

/**
 * FEAT-93: refusals whose details are the question to ask back — the cells
 * of the line ("De quelle case ?", "Quelles cases libérer ?"). Any other
 * code's details stay debug data, never kept.
 */
const QUESTION_CODES: ReadonlySet<string> = new Set([SLOT_CHOICE_REQUIRED, SLOT_CHANGED, SLOTS_TO_FREE_REQUIRED]);

/** Reads a non-OK response into an ApiError. */
export async function apiErrorFrom(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  const retryAfter = typeof body?.retryAfter === 'number' ? body.retryAfter : retryAfterHeader(res);
  // body.details carries structured debug data (e.g. Zod's err.format()), never a
  // displayable message — only body.error is the stable code callers can translate.
  if (typeof body?.error === 'string') {
    return new ApiError(body.error, res.status, retryAfter, QUESTION_CODES.has(body.error) ? body.details : undefined);
  }
  // A throttling proxy may answer 429 in plain text: still "wait", not "network error".
  if (res.status === 429) return new ApiError(TOO_MANY_REQUESTS_ERROR, res.status, retryAfter);
  return new ApiError(body ? `HTTP ${res.status}` : 'NETWORK_ERROR', res.status);
}

export async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) throw await apiErrorFrom(res);
  // A 204/205 (a delete, mostly) or an empty answer has no body to read.
  if (res.status === 204 || res.status === 205 || res.headers?.get('content-length') === '0') return undefined as T;
  const body = await res.json() as { data: T };
  return body.data;
}

const API_BASE = '/api';
export const DEFAULT_TIMEOUT_MS = 15000;

/**
 * AbortSignal.timeout() only exists from Safari 16 / iOS 16. On older browsers
 * every request would fail before being sent, so fall back to a plain
 * AbortController (#404).
 */
export function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')), ms);
  return controller.signal;
}

/** Timeout plus a caller's cancellation signal (AbortSignal.any is missing before Safari 17.4). */
function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = timeoutSignal(ms);
  if (!signal) return timeout;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([signal, timeout]);
  const controller = new AbortController();
  const abort = (s: AbortSignal) => () => controller.abort(s.reason);
  for (const s of [signal, timeout]) {
    if (s.aborted) controller.abort(s.reason);
    else s.addEventListener('abort', abort(s), { once: true });
  }
  return controller.signal;
}

export const client = {
  /** `signal`: lets React Query really cancel a superseded request. */
  async get<T>(url: string, { signal }: { signal?: AbortSignal } = {}): Promise<{ data: T }> {
    const res = await fetchOrNetworkError(`${API_BASE}${url}`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal: withTimeout(signal, DEFAULT_TIMEOUT_MS),
    });
    const data = await handleResponse<T>(res);
    return { data };
  },

  /** `timeoutMs`: for the rare request the server is allowed to work on longer (CSV import). */
  async post<T>(url: string, data?: unknown, { timeoutMs = DEFAULT_TIMEOUT_MS }: { timeoutMs?: number } = {}): Promise<{ data: T }> {
    const res = await fetchOrNetworkError(`${API_BASE}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: data ? JSON.stringify(data) : undefined,
      signal: timeoutSignal(timeoutMs),
    });
    const result = await handleResponse<T>(res);
    return { data: result };
  },

  async patch<T>(url: string, data?: unknown): Promise<{ data: T }> {
    const res = await fetchOrNetworkError(`${API_BASE}${url}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: data ? JSON.stringify(data) : undefined,
      signal: timeoutSignal(DEFAULT_TIMEOUT_MS),
    });
    const result = await handleResponse<T>(res);
    return { data: result };
  },

  async put<T>(url: string, data?: unknown): Promise<{ data: T }> {
    const res = await fetchOrNetworkError(`${API_BASE}${url}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: data ? JSON.stringify(data) : undefined,
      signal: timeoutSignal(DEFAULT_TIMEOUT_MS),
    });
    const result = await handleResponse<T>(res);
    return { data: result };
  },

  async delete<T>(url: string): Promise<{ data: T }> {
    const res = await fetchOrNetworkError(`${API_BASE}${url}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal: timeoutSignal(DEFAULT_TIMEOUT_MS),
    });
    const result = await handleResponse<T>(res);
    return { data: result };
  },
};
