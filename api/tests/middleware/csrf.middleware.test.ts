import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import { csrfGuard } from '../../src/middleware/csrf.middleware';

// #247 — on a NAS reached at http://192.168.1.20:3000 the browser sends no
// Fetch Metadata (insecure context) and its Origin is not APP_URL's default
// (http://localhost:3000): every POST, the first sign-up included, got a silent
// 403 that the web app showed as "unexpected error".

function run(method: string, headers: Record<string, string>, originalUrl = '/api/auth/register') {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const req = { method, originalUrl, get: (h: string) => lower[h.toLowerCase()] } as unknown as Request;
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

  // #600: `same-site` covers every subdomain of the same domain, so another
  // app of the home lab (photos.home.example) could forge requests to Glou.
  describe('same-site requests (#600)', () => {
    beforeEach(() => {
      process.env.APP_URL = 'https://glou.home.example';
    });

    it('rejects a sibling subdomain whose Origin is not trusted', () => {
      const r = run('POST', {
        'sec-fetch-site': 'same-site',
        origin: 'https://photos.home.example',
        'x-forwarded-host': 'glou.home.example',
        host: 'api:3001',
      });
      expect(r.next).not.toHaveBeenCalled();
      expect(r.status).toBe(403);
      expect(r.body).toEqual({ error: 'CSRF_ORIGIN_REJECTED' });
    });

    it('rejects a same-site request that carries no Origin', () => {
      const r = run('POST', { 'sec-fetch-site': 'same-site', host: 'glou.home.example' });
      expect(r.next).not.toHaveBeenCalled();
      expect(r.status).toBe(403);
    });

    it('accepts a same-site Origin listed in APP_URL, CORS_ORIGIN or CSRF_TRUSTED_ORIGINS', () => {
      expect(run('POST', { 'sec-fetch-site': 'same-site', origin: 'https://glou.home.example', host: 'api.home.example' }).next).toHaveBeenCalled();
      process.env.CSRF_TRUSTED_ORIGINS = 'https://cave.home.example';
      expect(run('POST', { 'sec-fetch-site': 'same-site', origin: 'https://cave.home.example', host: 'api.home.example' }).next).toHaveBeenCalled();
      process.env.CORS_ORIGIN = 'https://web.home.example';
      expect(run('POST', { 'sec-fetch-site': 'same-site', origin: 'https://web.home.example', host: 'api.home.example' }).next).toHaveBeenCalled();
    });

    it('accepts a same-site Origin equal to the host the request was sent to', () => {
      expect(run('POST', { 'sec-fetch-site': 'same-site', origin: 'http://nas.home.example:3000', 'x-forwarded-host': 'nas.home.example:3000', host: 'api:3001' }).next).toHaveBeenCalled();
    });

    it('still lets same-origin and address-bar requests through', () => {
      expect(run('POST', { 'sec-fetch-site': 'same-origin', origin: 'https://glou.home.example' }).next).toHaveBeenCalled();
      expect(run('POST', { 'sec-fetch-site': 'none' }).next).toHaveBeenCalled();
    });
  });

  // #612: a guest share link carries its token in the path.
  it('does not print the guest share token when it rejects a request', () => {
    const token = 'gst_SuperSecretToken123';
    const viaOrigin = run('PATCH', { origin: 'https://evil.example', host: 'api:3001' }, `/api/guest/${token}/inventory/7`);
    const viaSameSite = run(
      'PATCH',
      { 'sec-fetch-site': 'same-site', origin: 'https://photos.home.example', host: 'glou.home.example' },
      `/api/guest/${token}/inventory/7`,
    );
    expect(viaOrigin.status).toBe(403);
    expect(viaSameSite.status).toBe(403);
    const logged = JSON.stringify((console.warn as unknown as ReturnType<typeof vi.fn>).mock.calls);
    expect(logged).toContain('/api/guest/***/inventory/7');
    expect(logged).not.toContain(token);
  });

  it('leaves safe methods and non-browser clients alone', () => {
    expect(run('GET', { origin: 'https://evil.example' }).next).toHaveBeenCalled();
    expect(run('POST', {}).next).toHaveBeenCalled();
  });
});
