import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import { csrfGuard } from '../../src/middleware/csrf.middleware';

// #247 — on a NAS reached at http://192.168.1.20:3000 the browser sends no
// Fetch Metadata (insecure context) and its Origin is not APP_URL's default
// (http://localhost:3000): every POST, the first sign-up included, got a silent
// 403 that the web app showed as "unexpected error".

function run(method: string, headers: Record<string, string>) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const req = { method, originalUrl: '/api/auth/register', get: (h: string) => lower[h.toLowerCase()] } as unknown as Request;
  const json = vi.fn();
  const res = { status: vi.fn().mockReturnValue({ json }) } as unknown as Response;
  const next = vi.fn();
  csrfGuard(req, res, next);
  return { next, status: (res.status as ReturnType<typeof vi.fn>).mock.calls[0]?.[0], body: json.mock.calls[0]?.[0] };
}

describe('csrfGuard', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.CSRF_TRUSTED_ORIGINS;
    delete process.env.CORS_ORIGIN;
    process.env.APP_URL = 'http://localhost:3000';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('lets a LAN address through when it is the host the request was sent to (#247)', () => {
    const r = run('POST', { origin: 'http://192.168.1.20:3000', 'x-forwarded-host': '192.168.1.20:3000', host: 'api:3001' });
    expect(r.next).toHaveBeenCalled();
  });

  it('also accepts it through the Host header, without the Next proxy', () => {
    expect(run('POST', { origin: 'http://nas.local:3001', host: 'nas.local:3001' }).next).toHaveBeenCalled();
  });

  it('still rejects a cross-site Origin', () => {
    const r = run('POST', { origin: 'https://evil.example', 'x-forwarded-host': '192.168.1.20:3000', host: 'api:3001' });
    expect(r.next).not.toHaveBeenCalled();
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'CSRF_ORIGIN_REJECTED' });
  });

  it('does not treat a lookalike host as the same host', () => {
    const r = run('POST', { origin: 'http://192.168.1.20:3000.evil.example', 'x-forwarded-host': '192.168.1.20:3000' });
    expect(r.status).toBe(403);
  });

  it('rejects a malformed Origin instead of throwing', () => {
    expect(run('POST', { origin: 'not a url', host: 'api:3001' }).status).toBe(403);
  });

  it('keeps honouring APP_URL, CORS_ORIGIN and CSRF_TRUSTED_ORIGINS', () => {
    expect(run('POST', { origin: 'http://localhost:3000', host: 'api:3001' }).next).toHaveBeenCalled();
    process.env.CSRF_TRUSTED_ORIGINS = 'https://cave.example.com';
    expect(run('POST', { origin: 'https://cave.example.com', host: 'api:3001' }).next).toHaveBeenCalled();
  });

  it('still blocks a cross-site fetch declared by Fetch Metadata', () => {
    const r = run('POST', { 'sec-fetch-site': 'cross-site', origin: 'http://192.168.1.20:3000', 'x-forwarded-host': '192.168.1.20:3000' });
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'CSRF_CROSS_SITE_REJECTED' });
  });

  it('leaves safe methods and non-browser clients alone', () => {
    expect(run('GET', { origin: 'https://evil.example' }).next).toHaveBeenCalled();
    expect(run('POST', {}).next).toHaveBeenCalled();
  });
});
