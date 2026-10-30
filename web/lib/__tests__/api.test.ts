import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiError, apiErrorFrom, client, handleResponse } from '../api';
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
