import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import { getClientIp } from '../../src/middleware/auth.middleware';

function fakeRequest(overrides: Partial<{ ip: string; remoteAddress: string; xForwardedFor: string }>): Request {
  return {
    ip: overrides.ip,
    socket: { remoteAddress: overrides.remoteAddress } as never,
    headers: overrides.xForwardedFor ? { 'x-forwarded-for': overrides.xForwardedFor } : {},
  } as unknown as Request;
}

describe('getClientIp (ISSUE_041)', () => {
  it('uses req.ip, computed by Express from the trust-proxy setting', () => {
    expect(getClientIp(fakeRequest({ ip: '203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('ignores a client-supplied X-Forwarded-For header entirely when req.ip disagrees', () => {
    // Express already folds X-Forwarded-For into req.ip when trust proxy is
    // configured — a raw header read on top of that is what let a caller
    // override the address by hand. Here req.ip (the trustworthy value) wins.
    const req = fakeRequest({ ip: '203.0.113.7', xForwardedFor: '1.2.3.4, 203.0.113.7' });
    expect(getClientIp(req)).toBe('203.0.113.7');
  });

  it('falls back to the raw socket address when req.ip is unset', () => {
    expect(getClientIp(fakeRequest({ remoteAddress: '198.51.100.9' }))).toBe('198.51.100.9');
  });

  it('falls back to "unknown" when nothing is available', () => {
    expect(getClientIp(fakeRequest({}))).toBe('unknown');
  });
});
