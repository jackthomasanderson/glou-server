import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';

// #636: six routes read `req.body` by hand. Since Express 5 it is
// `undefined` when no JSON body was parsed, so destructuring it threw: a 500
// (role, status, SMTP test), "link sent" for a forgotten password, a generic
// answer elsewhere. Each now goes through a schema and answers 400.
// #607: "forgot password" answers before the e-mail is sent, whether or not
// the address has an account.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    session: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
  },
  connectWithRetry: vi.fn(),
}));

// The per-IP limits are covered by auth-rate-limit.test.ts; here they would
// only cap how many cases one file may send.
vi.mock('../../src/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/rate-limit')>();
  const pass = (_req: unknown, _res: unknown, next: () => void) => next();
  return { ...actual, authRateLimit: () => pass, accountRateLimit: () => [pass] };
});

import { prisma } from '../../src/lib/prisma';
import { createApp } from '../../src/app';
import { passwordResetService } from '../../src/services/password-reset.service';
import { authService } from '../../src/services/auth.service';
import { emailService } from '../../src/services/email.service';
import { humidorService } from '../../src/services/humidor.service';

const JWT_SECRET = 'integration-test-secret';
const app = createApp();
const bearer = `Bearer ${jwt.sign({ userId: 'u1', email: 'u1@example.com', scope: 'full', sessionId: 's1' }, JWT_SECRET, { algorithm: 'HS256' })}`;

const spies: Array<{ mockRestore: () => void }> = [];
const keep = <T extends { mockRestore: () => void }>(s: T): T => {
  spies.push(s);
  return s;
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = JWT_SECRET;
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', isActive: true, isAdmin: true } as never);
  vi.mocked(prisma.session.findUnique).mockResolvedValue({ revokedAt: null, expiresAt: new Date(Date.now() + 3_600_000) } as never);
  vi.mocked(prisma.session.update).mockResolvedValue({} as never);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  keep(vi.spyOn(console, 'warn').mockImplementation(() => undefined));
});

afterEach(() => {
  while (spies.length) spies.pop()!.mockRestore();
});

/** A request whose body is not JSON: express.json() leaves `req.body` undefined. */
const formPost = (method: 'post' | 'patch' | 'put', path: string, auth = false) => {
  const r = request(app)[method](path).set('Sec-Fetch-Site', 'same-origin').set('Content-Type', 'application/x-www-form-urlencoded');
  return (auth ? r.set('Authorization', bearer) : r).send('isActive=false&email=a%40b.c&token=t');
};

describe('routes without a JSON body answer 400, not 500 (#636)', () => {
  const cases: Array<[string, 'post' | 'patch' | 'put', string, boolean]> = [
    ['forgot-password', 'post', '/api/auth/forgot-password', false],
    ['validate-reset-token', 'post', '/api/auth/validate-reset-token', false],
    ['reset-password', 'post', '/api/auth/reset-password', false],
    ['admin role', 'post', '/api/admin/users/u2/role', true],
    ['admin status', 'patch', '/api/admin/users/u2/status', true],
    ['admin SMTP test', 'post', '/api/admin/config/test/smtp', true],
  ];

  it.each(cases)('%s', async (_name, method, path, auth) => {
    const requestReset = keep(vi.spyOn(passwordResetService, 'requestReset').mockResolvedValue());
    const validate = keep(vi.spyOn(passwordResetService, 'validateToken').mockResolvedValue({ valid: true }));
    const reset = keep(vi.spyOn(passwordResetService, 'resetPassword').mockResolvedValue());
    const reauth = keep(vi.spyOn(authService, 'reauthenticateAdmin').mockResolvedValue(undefined as never));
    const smtp = keep(vi.spyOn(emailService, 'testConnection').mockResolvedValue({ success: true }));

    const res = await formPost(method, path, auth);

    expect(res.status).toBe(400);
    expect(['VALIDATION_ERROR', 'INVALID_INPUT']).toContain(res.body.error);
    for (const spy of [requestReset, validate, reset, reauth, smtp]) expect(spy).not.toHaveBeenCalled();
  });
});

describe('field rules now in the schemas (#636)', () => {
  const post = (path: string, body: unknown) =>
    request(app).post(path).set('Sec-Fetch-Site', 'same-origin').set('Authorization', bearer).send(body as object);

  it('reset-password keeps its PASSWORD_TOO_SHORT code', async () => {
    const reset = keep(vi.spyOn(passwordResetService, 'resetPassword').mockResolvedValue());
    const res = await post('/api/auth/reset-password', { token: 'abc', newPassword: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('PASSWORD_TOO_SHORT');
    expect(reset).not.toHaveBeenCalled();
  });

  it('reset-password refuses more than 128 characters with PASSWORD_TOO_LONG', async () => {
    const reset = keep(vi.spyOn(passwordResetService, 'resetPassword').mockResolvedValue());
    const res = await post('/api/auth/reset-password', { token: 'abc', newPassword: 'x'.repeat(129) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('PASSWORD_TOO_LONG');
    expect(reset).not.toHaveBeenCalled();
  });

  it('reset-password passes a valid request through', async () => {
    const reset = keep(vi.spyOn(passwordResetService, 'resetPassword').mockResolvedValue());
    const res = await post('/api/auth/reset-password', { token: 'abc', newPassword: 'a-long-enough-password' });
    expect(res.status).toBe(200);
    expect(reset).toHaveBeenCalledWith('abc', 'a-long-enough-password', expect.any(Object));
  });

  it('the SMTP test refuses a malformed address before the step-up', async () => {
    const reauth = keep(vi.spyOn(authService, 'reauthenticateAdmin').mockResolvedValue(undefined as never));
    const send = keep(vi.spyOn(emailService, 'sendTestEmail').mockResolvedValue({ success: true }));
    const res = await post('/api/admin/config/test/smtp', { email: 'not-an-address', password: 'pw' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(reauth).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('the SMTP test still sends to a valid address, or tests the connection without one', async () => {
    keep(vi.spyOn(authService, 'reauthenticateAdmin').mockResolvedValue(undefined as never));
    const send = keep(vi.spyOn(emailService, 'sendTestEmail').mockResolvedValue({ success: true }));
    const connect = keep(vi.spyOn(emailService, 'testConnection').mockResolvedValue({ success: true }));
    expect((await post('/api/admin/config/test/smtp', { email: 'admin@example.com', password: 'pw' })).status).toBe(200);
    expect(send).toHaveBeenCalledWith('admin@example.com');
    expect((await post('/api/admin/config/test/smtp', { password: 'pw' })).status).toBe(200);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('role and status refuse a non-boolean value', async () => {
    expect((await post('/api/admin/users/u2/role', { isAdmin: 'true' })).body.error).toBe('INVALID_INPUT');
    const status = await request(app)
      .patch('/api/admin/users/u2/status')
      .set('Sec-Fetch-Site', 'same-origin')
      .set('Authorization', bearer)
      .send({ isActive: 1 });
    expect(status.status).toBe(400);
    expect(status.body.error).toBe('INVALID_INPUT');
  });
});

describe('humidor history limit (#636)', () => {
  const get = (query: string) =>
    request(app).get(`/api/humidor/cellars/c1/readings${query}`).set('Authorization', bearer);

  it.each(['?limit=1.5', '?limit=0', '?limit=101', '?limit=abc'])('refuses %s with 400 before reaching the database', async (query) => {
    const history = keep(vi.spyOn(humidorService, 'getHistory').mockResolvedValue(null));
    const res = await get(query);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(history).not.toHaveBeenCalled();
  });

  it('defaults to 30 and passes a valid limit through', async () => {
    const history = keep(vi.spyOn(humidorService, 'getHistory').mockResolvedValue(null));
    await get('');
    await get('?limit=100');
    expect(history.mock.calls.map((c) => c[1])).toEqual([30, 100]);
  });
});

describe('forgot-password answers before the e-mail is sent (#607)', () => {
  const forgot = (email: string) =>
    request(app).post('/api/auth/forgot-password').set('Sec-Fetch-Site', 'same-origin').send({ email });

  it('does not wait for a send that has not finished', async () => {
    let finish: () => void = () => undefined;
    const requestReset = keep(
      vi.spyOn(passwordResetService, 'requestReset').mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; })),
    );
    const res = await forgot('  Member@Example.com ');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { ok: true } });
    expect(requestReset).toHaveBeenCalledWith('member@example.com');
    finish();
  });

  it('still answers ok when the send fails, and logs the failure', async () => {
    const error = keep(vi.spyOn(console, 'error').mockImplementation(() => undefined));
    keep(vi.spyOn(passwordResetService, 'requestReset').mockRejectedValue(new Error('SMTP down')));
    const res = await forgot('member@example.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { ok: true } });
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith('[auth] POST /forgot-password failed:', expect.any(Error)));
  });

  it('refuses an empty address without starting anything', async () => {
    const requestReset = keep(vi.spyOn(passwordResetService, 'requestReset').mockResolvedValue());
    const res = await forgot('   ');
    expect(res.status).toBe(400);
    expect(requestReset).not.toHaveBeenCalled();
  });
});

describe('validate-reset-token tells a server failure from a dead link (#608 comment, #744)', () => {
  const validate = (token: string) =>
    request(app).post('/api/auth/validate-reset-token').set('Sec-Fetch-Site', 'same-origin').send({ token });

  it('answers valid: false for a dead link', async () => {
    keep(vi.spyOn(passwordResetService, 'validateToken').mockResolvedValue({ valid: false }));
    const res = await validate('dead');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { valid: false } });
  });

  it('answers an error, not valid: false, when the check itself fails', async () => {
    keep(vi.spyOn(console, 'error').mockImplementation(() => undefined));
    keep(vi.spyOn(passwordResetService, 'validateToken').mockRejectedValue(new Error('db exploded')));
    const res = await validate('some-token');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'UNEXPECTED_ERROR' });
  });
});
