import { TOO_MANY_REQUESTS_ERROR } from '@shared/auth';
import { fetchOrNetworkError } from './network-error';

type ApiErrorBody = { error?: unknown; retryAfter?: unknown; details?: unknown };

/**
 * A refusal from the API. `message` is the stable error code callers translate;
 * `retryAfter` (seconds) comes with TOO_MANY_REQUESTS (#640).
 */
export class ApiError extends Error {
  constructor(code: string, readonly status: number, readonly retryAfter?: number) {
    super(code);
    this.name = 'ApiError';
  }
}

function retryAfterHeader(res: Response): number | undefined {
  const seconds = Number(res.headers?.get('Retry-After'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

/** Reads a non-OK response into an ApiError. */
export async function apiErrorFrom(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  const retryAfter = typeof body?.retryAfter === 'number' ? body.retryAfter : retryAfterHeader(res);
  // body.details carries structured debug data (e.g. Zod's err.format()), never a
  // displayable message — only body.error is the stable code callers can translate.
  if (typeof body?.error === 'string') return new ApiError(body.error, res.status, retryAfter);
  // A throttling proxy may answer 429 in plain text: still "wait", not "network error".
  if (res.status === 429) return new ApiError(TOO_MANY_REQUESTS_ERROR, res.status, retryAfter);
  return new ApiError(body ? `HTTP ${res.status}` : 'NETWORK_ERROR', res.status);
}

export async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) throw await apiErrorFrom(res);
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

export const client = {
  async get<T>(url: string): Promise<{ data: T }> {
    const res = await fetchOrNetworkError(`${API_BASE}${url}`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal: timeoutSignal(DEFAULT_TIMEOUT_MS),
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
