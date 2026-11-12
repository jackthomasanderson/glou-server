import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiError, apiErrorFrom, client, DEFAULT_TIMEOUT_MS, handleResponse, request } from '../api';
import { NetworkError } from '../network-error';

function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('handleResponse', () => {
  it('returns data on success', async () => {
    const res = mockResponse(200, { data: { id: '1', name: 'test' } });
    const result = await handleResponse<{ id: string; name: string }>(res);
    expect(result).toEqual({ id: '1', name: 'test' });
  });

  // #580: a delete answered 204 No Content was read as JSON and reported as a failure.
  it('returns undefined on 204 No Content without reading a body', async () => {
    const res = new Response(null, { status: 204 });
    await expect(handleResponse<void>(res)).resolves.toBeUndefined();
  });

  it('returns undefined on 205 Reset Content and on an empty 200', async () => {
    await expect(handleResponse<void>(new Response(null, { status: 205 }))).resolves.toBeUndefined();
    const empty = new Response('', { status: 200, headers: { 'Content-Length': '0' } });
    await expect(handleResponse<void>(empty)).resolves.toBeUndefined();
  });

  it('throws error message from body.error on non-ok response', async () => {
    const res = mockResponse(400, { error: 'VALIDATION_ERROR' });
    await expect(handleResponse(res)).rejects.toThrow('VALIDATION_ERROR');
  });

  it('always throws body.error, never body.details, even when details is a Zod format object', async () => {
    const res = mockResponse(422, {
      error: 'VALIDATION_ERROR',
      details: { username: { _errors: ['USERNAME_TOO_SHORT'] } },
    });
    await expect(handleResponse(res)).rejects.toThrow('VALIDATION_ERROR');
  });

  it('throws NETWORK_ERROR when body parse fails', async () => {
    const res = {
      ok: false,
      status: 503,
      json: () => Promise.reject(new Error('not json')),
    } as unknown as Response;
    await expect(handleResponse(res)).rejects.toThrow('NETWORK_ERROR');
  });
});

// #640: a throttled sign-in or reset must read as "wait", with how long.
describe('apiErrorFrom', () => {
  it('keeps the code, the status and the wait of a JSON 429', async () => {
    const err = await apiErrorFrom(mockResponse(429, { error: 'TOO_MANY_REQUESTS', retryAfter: 840 }));
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: 'TOO_MANY_REQUESTS', status: 429, retryAfter: 840 });
  });

  it('reads a plain-text 429 as TOO_MANY_REQUESTS, with the Retry-After header', async () => {
    const res = {
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '120' }),
      json: () => Promise.reject(new SyntaxError('Unexpected token T')),
    } as unknown as Response;
    expect(await apiErrorFrom(res)).toMatchObject({ message: 'TOO_MANY_REQUESTS', retryAfter: 120 });
  });

  // FEAT-93: the cells a 409 asks about come with it; other details (debug data) never do.
  it('keeps the details of a question about cells, and only those', async () => {
    const details = { slots: [{ id: 's1', column: 1, row: 1 }], unplaced: 1 };
    expect(await apiErrorFrom(mockResponse(409, { error: 'SLOT_CHOICE_REQUIRED', details })))
      .toMatchObject({ message: 'SLOT_CHOICE_REQUIRED', status: 409, details });
    expect((await apiErrorFrom(mockResponse(400, { error: 'VALIDATION_ERROR', details: { a: 1 } }))).details).toBeUndefined();
  });

  it('handleResponse throws the same ApiError', async () => {
    await expect(handleResponse(mockResponse(429, { error: 'TOO_MANY_REQUESTS', retryAfter: 60 })))
      .rejects.toMatchObject({ message: 'TOO_MANY_REQUESTS', retryAfter: 60 });
  });
});

// #582/#640: a request that got no answer is told apart from a bug in our own
// code, while staying a TypeError for the offline queue (useUpdateInventoryItem).
describe('client without an answer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rethrows fetch\'s TypeError as a NetworkError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const err = await client.get('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NetworkError);
    expect(err).toBeInstanceOf(TypeError);
  });

  it('leaves a timeout as it is', async () => {
    const timeout = new DOMException('The operation timed out.', 'TimeoutError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout));
    await expect(client.get('/x')).rejects.toBe(timeout);
  });
});

// #619: the one door every API call goes through — cookie, deadline, errors.
describe('request', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** A server that accepts the connection and never answers (captive portal, cellar Wi-Fi). */
  const neverAnswers = () => vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  }));

  it('aborts a request that never answers', async () => {
    const fetchMock = neverAnswers();
    vi.stubGlobal('fetch', fetchMock);
    const err = await request('/user/me', { timeoutMs: 20 }).catch((e: unknown) => e);
    expect((err as { name?: string }).name).toBe('TimeoutError');
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  });

  it('gives every request the app-wide deadline and the session cookie', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await request('/auth/login', { method: 'POST' });
    expect(timeout).toHaveBeenCalledWith(DEFAULT_TIMEOUT_MS);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST', credentials: 'include' }));
  });

  it('still lets the caller cancel', async () => {
    vi.stubGlobal('fetch', neverAnswers());
    const controller = new AbortController();
    const pending = request('/x', { signal: controller.signal });
    controller.abort(new DOMException('superseded', 'AbortError'));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rethrows a request without an answer as a NetworkError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(request('/x')).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('client.upload and client.blob', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the form as it is, without a JSON content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { ok: 1 } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const form = new FormData();
    await expect(client.upload('/user/avatar', form)).resolves.toEqual({ data: { ok: 1 } });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.body).toBe(form);
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
  });

  it('reads a proxy page without a code from its status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>413</html>', { status: 413 })));
    await expect(client.upload('/scan', new FormData(), { codeByStatus: { 413: 'FILE_TOO_LARGE' } }))
      .rejects.toMatchObject({ message: 'FILE_TOO_LARGE', status: 413 });
  });

  it('reads a proxy 502 page as NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 })));
    await expect(client.upload('/scan', new FormData())).rejects.toMatchObject({ message: 'NETWORK_ERROR' });
    await expect(client.blob('/user/export')).rejects.toMatchObject({ message: 'NETWORK_ERROR' });
  });

  it('hands a download back as a file with its headers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('a;b', { status: 200, headers: { 'X-Glou-Rows': '2' } })));
    const { blob, headers } = await client.blob('/inventory/export.csv');
    expect(await blob.text()).toBe('a;b');
    expect(headers.get('X-Glou-Rows')).toBe('2');
  });
});
