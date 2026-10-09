import { describe, it, expect } from 'vitest';
import { handleResponse } from '../api';

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
