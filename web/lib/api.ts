import { TOO_MANY_REQUESTS_ERROR } from '@shared/auth';
import { SLOT_CHANGED, SLOT_CHOICE_REQUIRED, SLOTS_TO_FREE_REQUIRED } from '@shared/product';
import { NetworkError } from './network-error';

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

/**
 * Reads a non-OK response into an ApiError. `codeByStatus`: what a status
 * means when the answer carries no code — a reverse proxy refusing an upload
 * with its own page (413 FILE_TOO_LARGE…).
 */
export async function apiErrorFrom(res: Response, codeByStatus: Readonly<Record<number, string>> = {}): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  const retryAfter = typeof body?.retryAfter === 'number' ? body.retryAfter : retryAfterHeader(res);
  // body.details carries structured debug data (e.g. Zod's err.format()), never a
  // displayable message — only body.error is the stable code callers can translate.
  if (typeof body?.error === 'string') {
    return new ApiError(body.error, res.status, retryAfter, QUESTION_CODES.has(body.error) ? body.details : undefined);
  }
  if (codeByStatus[res.status]) return new ApiError(codeByStatus[res.status], res.status, retryAfter);
  // A throttling proxy may answer 429 in plain text: still "wait", not "network error".
  if (res.status === 429) return new ApiError(TOO_MANY_REQUESTS_ERROR, res.status, retryAfter);
  return new ApiError(body ? `HTTP ${res.status}` : 'NETWORK_ERROR', res.status);
}

/** A 204/205 (a delete, mostly) or an empty answer has no body to read. */
function hasNoBody(res: Response): boolean {
  return res.status === 204 || res.status === 205 || res.headers?.get('content-length') === '0';
}

export async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) throw await apiErrorFrom(res);
  if (hasNoBody(res)) return undefined as T;
  const body = await res.json() as { data: T };
  return body.data;
}

const API_BASE = '/api';
export const DEFAULT_TIMEOUT_MS = 15000;

/**
 * A file sent or saved: a photo over a slow phone link, an export, a backup
 * (#645). Longer than the usual 15 s, shorter than the /api proxy's own
 * timeout (next.config.mjs). The deadline covers the transfer too.
 */
export const FILE_TIMEOUT_MS = 60_000;

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

export interface RequestOptions extends Omit<RequestInit, 'credentials' | 'signal'> {
  /** The caller's own cancellation (React Query's, for a superseded request), on top of the deadline. */
  signal?: AbortSignal;
  /** For the rare request the server is allowed to work on longer (CSV import, backups, files). */
  timeoutMs?: number;
}

/**
 * #619: the one door to the API — every call of the web app goes through it
 * (CONTRIBUTING.md; ESLint forbids `fetch` elsewhere). It sends the session
 * cookie, gives up after `timeoutMs` (a TimeoutError), and turns a request
 * that got no answer at all into a NetworkError. `path` is under /api.
 *
 * Answers the raw Response, whatever its status: for the few callers that
 * read a status themselves (`/user/me`'s 401, the offline queue's 409).
 * Everything else uses `requestJson` or `client` below.
 */
export async function request(path: string, { signal, timeoutMs = DEFAULT_TIMEOUT_MS, ...init }: RequestOptions = {}): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, { ...init, credentials: 'include', signal: withTimeout(signal, timeoutMs) });
  } catch (err) {
    // No answer at all (offline, DNS, server down); timeouts and aborts are left as they are.
    if (err instanceof TypeError) throw new NetworkError(err);
    throw err;
  }
}

export interface JsonOptions extends Omit<RequestOptions, 'body' | 'headers'> {
  /** Sent as JSON. */
  body?: unknown;
}

/**
 * `request` with a JSON body, a refusal thrown as an ApiError, and the whole
 * answer — for the callers that read more than `data` (`truncated`, the
 * other lines a write changed…).
 */
export async function requestJson<B>(path: string, { body, ...options }: JsonOptions = {}): Promise<B> {
  const res = await request(path, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await apiErrorFrom(res);
  if (hasNoBody(res)) return undefined as B;
  return (await res.json()) as B;
}

async function send<T>(method: string, path: string, body: unknown, options: Omit<JsonOptions, 'method' | 'body'> = {}): Promise<{ data: T }> {
  const answer = await requestJson<{ data: T } | undefined>(path, { ...options, method, body });
  return { data: answer?.data as T };
}

export const client = {
  /** `signal`: lets React Query really cancel a superseded request. */
  get<T>(url: string, { signal }: { signal?: AbortSignal } = {}): Promise<{ data: T }> {
    return send<T>('GET', url, undefined, { signal });
  },

  /** `timeoutMs`: for the rare request the server is allowed to work on longer (CSV import). */
  post<T>(url: string, data?: unknown, { timeoutMs }: { timeoutMs?: number } = {}): Promise<{ data: T }> {
    return send<T>('POST', url, data, { timeoutMs });
  },

  patch<T>(url: string, data?: unknown): Promise<{ data: T }> {
    return send<T>('PATCH', url, data);
  },

  put<T>(url: string, data?: unknown): Promise<{ data: T }> {
    return send<T>('PUT', url, data);
  },

  /** `data`: the few deletions that confirm with a password (removing the PIN). */
  delete<T>(url: string, data?: unknown): Promise<{ data: T }> {
    return send<T>('DELETE', url, data);
  },

  /**
   * A form with a file, sent as multipart (no JSON content type). A 2xx
   * without `data` (a sign-in portal's page) is UNEXPECTED_ERROR.
   */
  async upload<T>(
    url: string,
    form: FormData,
    { timeoutMs = FILE_TIMEOUT_MS, codeByStatus }: { timeoutMs?: number; codeByStatus?: Readonly<Record<number, string>> } = {},
  ): Promise<{ data: T }> {
    const res = await request(url, { method: 'POST', body: form, timeoutMs });
    if (!res.ok) throw await apiErrorFrom(res, codeByStatus);
    const answer = (await res.json().catch(() => null)) as { data?: T } | null;
    if (answer?.data == null) throw new ApiError('UNEXPECTED_ERROR', res.status);
    return { data: answer.data };
  },

  /** A file to save (an export, a backup), with the headers that name or count it; `body`: sent as JSON. */
  async blob(
    url: string,
    { method, body, timeoutMs = FILE_TIMEOUT_MS }: { method?: 'GET' | 'POST'; body?: unknown; timeoutMs?: number } = {},
  ): Promise<{ blob: Blob; headers: Headers }> {
    const res = await request(url, {
      method,
      timeoutMs,
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    if (!res.ok) throw await apiErrorFrom(res);
    return { blob: await res.blob(), headers: res.headers };
  },
};
