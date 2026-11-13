import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import crypto from 'crypto';

// #773: signing out every other session took one confirmation per session,
// although the server already had the function. DELETE /api/auth/sessions
// signs out all the caller's sessions but the current one. Through the real
// app; only the database is stubbed, with a small stateful session table.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    session: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    trustedDevice: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
  },
  connectWithRetry: vi.fn(),
}));

import { prisma } from '../../src/lib/prisma';
import { createApp } from '../../src/app';
import { notificationService } from '../../src/services/notification.service';
import { systemConfigService } from '../../src/services/system-config.service';

const JWT_SECRET = 'integration-test-secret';

type SessionRow = { id: string; userId: string; revokedAt: Date | null; expiresAt: Date; userAgent: string | null; ip: string | null };
let sessions: SessionRow[] = [];
type DeviceRow = { id: string; userId: string; tokenHash: string; revokedAt: Date | null };
let devices: DeviceRow[] = [];
const hash = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');

const live = (id: string, userId: string): SessionRow =>
  ({ id, userId, revokedAt: null, expiresAt: new Date(Date.now() + 3_600_000), userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0', ip: '203.0.113.7' });

/** The subset of Prisma's `where` the session queries use. */
function matches(row: SessionRow, where: Record<string, unknown>): boolean {
  if (typeof where.id === 'string' && row.id !== where.id) return false;
  const inIds = (where.id as { in?: string[] } | undefined)?.in;
  if (inIds && !inIds.includes(row.id)) return false;
  if (where.userId !== undefined && row.userId !== where.userId) return false;
  if (where.revokedAt === null && row.revokedAt !== null) return false;
  const not = where.NOT as { id?: string } | undefined;
  if (not?.id !== undefined && row.id === not.id) return false;
  return true;
}

const app = createApp();
const as = (userId: string, sessionId: string) =>
  `Bearer ${jwt.sign({ userId, email: `${userId}@example.com`, scope: 'full', sessionId }, JWT_SECRET, { algorithm: 'HS256' })}`;
const signOutOthers = (userId: string, sessionId: string) =>
  request(app).delete('/api/auth/sessions').set('Authorization', as(userId, sessionId)).set('Sec-Fetch-Site', 'same-origin');
const auditCalls = () => vi.mocked(prisma.auditLog.create).mock.calls.map(([arg]) => (arg as { data: Record<string, unknown> }).data);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = JWT_SECRET;
  devices = [
    { id: 'd-here', userId: 'alice', tokenHash: hash('raw-here'), revokedAt: null },
    { id: 'd-laptop', userId: 'alice', tokenHash: hash('raw-laptop'), revokedAt: null },
    { id: 'd-bob', userId: 'bob', tokenHash: hash('raw-bob'), revokedAt: null },
  ];
  vi.mocked(prisma.trustedDevice.updateMany).mockImplementation((async (args: { where: { userId: string; revokedAt: null; NOT?: { tokenHash: string } }; data: { revokedAt: Date } }) => {
    const hit = devices.filter((d) => d.userId === args.where.userId && d.revokedAt === null && d.tokenHash !== args.where.NOT?.tokenHash);
    hit.forEach((d) => { d.revokedAt = args.data.revokedAt; });
    return { count: hit.length };
  }) as never);
  sessions = [live('a-current', 'alice'), live('a-laptop', 'alice'), live('a-phone', 'alice'), live('b-1', 'bob')];
  vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }] as never);
  vi.mocked(prisma.user.findUnique).mockImplementation((async (args: { where: { id: string } }) =>
    ({ id: args.where.id, isActive: true, isAdmin: false, language: 'EN', notifLanguage: null })) as never);
  vi.mocked(prisma.session.findUnique).mockImplementation((async (args: { where: { id: string } }) =>
    sessions.find((s) => s.id === args.where.id) ?? null) as never);
  vi.mocked(prisma.session.update).mockResolvedValue({} as never);
  vi.mocked(prisma.session.findMany).mockImplementation((async (args: { where: Record<string, unknown> }) =>
    sessions.filter((s) => matches(s, args.where)).map((s) => ({ id: s.id }))) as never);
  vi.mocked(prisma.session.updateMany).mockImplementation((async (args: { where: Record<string, unknown>; data: { revokedAt: Date } }) => {
    const hit = sessions.filter((s) => matches(s, args.where));
    hit.forEach((s) => { s.revokedAt = args.data.revokedAt; });
    return { count: hit.length };
  }) as never);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  vi.spyOn(notificationService, 'send').mockResolvedValue(undefined as never);
  vi.spyOn(systemConfigService, 'getEffectivePublicUrl').mockResolvedValue('https://glou.example');
});

const revoked = () => sessions.filter((s) => s.revokedAt).map((s) => s.id).sort();

describe('DELETE /api/auth/sessions signs out every other session (#773)', () => {
  it('keeps the current session, revokes the caller\'s others, leaves another member\'s alone', async () => {
    const res = await signOutOthers('alice', 'a-current');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ revoked: 2 });
    expect(revoked()).toEqual(['a-laptop', 'a-phone']);
    expect(sessions.find((s) => s.id === 'b-1')?.revokedAt).toBeNull();
  });

  it('the current session still works afterwards; a signed-out one does not', async () => {
    await signOutOthers('alice', 'a-current');
    expect((await request(app).get('/api/auth/sessions').set('Authorization', as('alice', 'a-current'))).status).toBe(200);
    const gone = await request(app).get('/api/auth/sessions').set('Authorization', as('alice', 'a-laptop'));
    expect(gone.status).toBe(401);
    expect(gone.body.error).toBe('SESSION_REVOKED');
  });

  it('is one audit entry, and the owner is told once', async () => {
    await signOutOthers('alice', 'a-current');
    const entries = auditCalls().filter((d) => d.action === 'SESSION_REVOKE');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      userId: 'alice',
      status: 'success',
      details: { reason: 'sign_out_other_sessions', revokedSessionIds: ['a-laptop', 'a-phone'], excludedSessionId: 'a-current' },
    });
    await vi.waitFor(() => expect(notificationService.send).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(vi.mocked(notificationService.send).mock.calls[0])).toContain('All your other sessions were signed out');
  });

  it('with no other session nor other trusted device, changes nothing and says so', async () => {
    const cookie = `glou_trusted_device=${jwt.sign({ tdt: 'raw-bob' }, JWT_SECRET, { expiresIn: '30d' })}`;
    const res = await signOutOthers('bob', 'b-1').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ revoked: 0 });
    expect(revoked()).toEqual([]);
    expect(notificationService.send).not.toHaveBeenCalled();
  });

  it('needs a session', async () => {
    const res = await request(app).delete('/api/auth/sessions').set('Sec-Fetch-Site', 'same-origin');
    expect(res.status).toBe(401);
    expect(revoked()).toEqual([]);
  });

  // Review R2: a trusted device lets a thief who knows the password skip the
  // 2FA code; the other devices stop being trusted too, this one stays.
  it('also stops trusting the caller\'s other devices, keeps this one and another member\'s', async () => {
    const cookie = `glou_trusted_device=${jwt.sign({ tdt: 'raw-here' }, JWT_SECRET, { expiresIn: '30d' })}`;
    const res = await signOutOthers('alice', 'a-current').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(devices.filter((d) => d.revokedAt).map((d) => d.id)).toEqual(['d-laptop']);
  });

  it('without a trusted-device cookie here, every trusted device of the caller is revoked', async () => {
    await signOutOthers('alice', 'a-current');
    expect(devices.filter((d) => d.revokedAt).map((d) => d.id).sort()).toEqual(['d-here', 'd-laptop']);
  });

  it('a lone session with another trusted device still tells the owner', async () => {
    devices.push({ id: 'd-bob-2', userId: 'bob', tokenHash: hash('raw-bob-2'), revokedAt: null });
    const cookie = `glou_trusted_device=${jwt.sign({ tdt: 'raw-bob' }, JWT_SECRET, { expiresIn: '30d' })}`;
    const res = await signOutOthers('bob', 'b-1').set('Cookie', cookie);
    expect(res.body.data).toEqual({ revoked: 0 });
    expect(devices.filter((d) => d.revokedAt).map((d) => d.id)).toEqual(['d-bob-2']);
    await vi.waitFor(() => expect(notificationService.send).toHaveBeenCalledTimes(1));
  });
});
