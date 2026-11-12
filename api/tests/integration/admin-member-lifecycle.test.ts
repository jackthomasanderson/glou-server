import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import bcrypt from 'bcryptjs';

// #695: an admin can delete a member for good, after their own password; not
// themselves, not the last admin; audited.
// #661: an admin can schedule (or cancel) the deletion of a member, and
// export a member's data — a member already deactivated cannot do either.
// The step-up runs for real (bcrypt); the database and the deletion itself
// (account-deletion.service, covered on its own) are stubbed.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), count: vi.fn(), update: vi.fn() },
    session: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
  },
  connectWithRetry: vi.fn(),
}));

vi.mock('../../src/services/account-deletion.service', () => ({
  deletePersonalData: vi.fn(),
  deleteMemberForGood: vi.fn(),
}));

import { prisma } from '../../src/lib/prisma';
import { createApp } from '../../src/app';
import { deleteMemberForGood } from '../../src/services/account-deletion.service';
import { authService } from '../../src/services/auth.service';
import { scanService } from '../../src/services/scan.service';

const JWT_SECRET = 'integration-test-secret';
const ADMIN_PASSWORD = 'admin-pw';
let passwordHash = '';

beforeAll(async () => {
  passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 4);
});

const app = createApp();
const token = () => jwt.sign({ userId: 'a1', email: 'a1@example.com', scope: 'full', sessionId: 's1' }, JWT_SECRET, { algorithm: 'HS256' });

/** The accounts the routes read: the acting admin (a1) and members. */
let accounts: Record<string, { id: string; isActive: boolean; isAdmin: boolean; username: string; deletionRequestedAt: Date | null }>;

const spies: Array<{ mockRestore: () => void }> = [];

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = JWT_SECRET;
  accounts = {
    a1: { id: 'a1', isActive: true, isAdmin: true, username: 'admin', deletionRequestedAt: null },
    m1: { id: 'm1', isActive: false, isAdmin: false, username: 'marie', deletionRequestedAt: null },
    a2: { id: 'a2', isActive: true, isAdmin: true, username: 'paul', deletionRequestedAt: null },
  };
  vi.mocked(prisma.session.findUnique).mockResolvedValue({ revokedAt: null, expiresAt: new Date(Date.now() + 3_600_000) } as never);
  vi.mocked(prisma.session.update).mockResolvedValue({} as never);
  vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }] as never);
  vi.mocked(prisma.user.findUnique).mockImplementation((async ({ where }: { where: { id: string } }) => accounts[where.id] ?? null) as never);
  vi.mocked(prisma.user.findUniqueOrThrow).mockImplementation((async () => ({
    id: 'a1', passwordHash, isTwoFactorEnabled: false, twoFactorSecret: null, backupCodes: [],
  })) as never);
  vi.mocked(prisma.user.count).mockResolvedValue(1);
  vi.mocked(prisma.user.update).mockImplementation((async ({ where, data }: { where: { id: string }; data: object }) => ({ ...accounts[where.id], ...data })) as never);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  vi.mocked(deleteMemberForGood).mockResolvedValue({ username: 'marie', avatarPaths: ['/uploads/avatars/m.png'], scanImagePaths: ['/app/uploads/scans/s.jpg'] });
  spies.push(
    vi.spyOn(authService, 'exportUserData').mockResolvedValue({ profile: { id: 'm1' } }),
    vi.spyOn(authService, 'deleteAvatarFiles').mockResolvedValue(),
    vi.spyOn(scanService, 'deleteScanFiles').mockResolvedValue(),
    vi.spyOn(console, 'error').mockImplementation(() => {}),
  );
});

afterEach(() => {
  spies.splice(0).forEach((s) => s.mockRestore());
});

const as = (method: 'post' | 'put', path: string, body: Record<string, unknown> = {}) =>
  request(app)[method](path)
    .set('Authorization', `Bearer ${token()}`)
    .set('Sec-Fetch-Site', 'same-origin')
    .send(body);

const auditCalls = () => vi.mocked(prisma.auditLog.create).mock.calls.map(([arg]) => (arg as { data: Record<string, unknown> }).data);

describe('POST /api/admin/users/:userId/delete (#695)', () => {
  it('deletes a deactivated member for good once the admin gave their password, then their files', async () => {
    const res = await as('post', '/api/admin/users/m1/delete', { password: ADMIN_PASSWORD });

    expect(res.status).toBe(200);
    expect(deleteMemberForGood).toHaveBeenCalledWith('m1', 'a1');
    expect(authService.deleteAvatarFiles).toHaveBeenCalledWith(['/uploads/avatars/m.png']);
    expect(scanService.deleteScanFiles).toHaveBeenCalledWith(['/app/uploads/scans/s.jpg']);
    // Who deleted whom, readable once the account is gone.
    await vi.waitFor(() => expect(auditCalls()).toContainEqual(expect.objectContaining({
      userId: 'a1', action: 'ADMIN_MEMBER_DELETE', status: 'success', details: { targetUserId: 'm1', username: 'marie' },
    })));
  });

  it('refuses with the session alone, and audits the refusal', async () => {
    const res = await as('post', '/api/admin/users/m1/delete');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('REAUTH_REQUIRED');
    expect(deleteMemberForGood).not.toHaveBeenCalled();
    expect(auditCalls()).toContainEqual(expect.objectContaining({ action: 'ADMIN_MEMBER_DELETE', status: 'error' }));
  });

  it('refuses a wrong password', async () => {
    const res = await as('post', '/api/admin/users/m1/delete', { password: 'not-it' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('INVALID_PASSWORD');
    expect(deleteMemberForGood).not.toHaveBeenCalled();
  });

  it('refuses the admin\'s own account, before asking the password', async () => {
    const res = await as('post', '/api/admin/users/a1/delete', { password: ADMIN_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CANNOT_DELETE_SELF');
    expect(prisma.user.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(deleteMemberForGood).not.toHaveBeenCalled();
  });

  it('refuses the last admin: the other admins already leaving do not count', async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(0);

    const res = await as('post', '/api/admin/users/a2/delete', { password: ADMIN_PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CANNOT_DELETE_LAST_ADMIN');
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { isAdmin: true, isActive: true, deletionRequestedAt: null, id: { not: 'a2' } },
    });
    expect(deleteMemberForGood).not.toHaveBeenCalled();
  });

  it('answers 409 when the last-admin check made in the transaction refuses (two admins deleting each other)', async () => {
    vi.mocked(deleteMemberForGood).mockRejectedValue(new Error('CANNOT_DELETE_LAST_ADMIN'));

    const res = await as('post', '/api/admin/users/a2/delete', { password: ADMIN_PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CANNOT_DELETE_LAST_ADMIN');
    expect(authService.deleteAvatarFiles).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown member', async () => {
    const res = await as('post', '/api/admin/users/nobody/delete', { password: ADMIN_PASSWORD });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('USER_NOT_FOUND');
  });
});

describe('PUT /api/admin/users/:userId/deletion (#661)', () => {
  it('schedules the deletion of a deactivated member, after the admin\'s password', async () => {
    const res = await as('put', '/api/admin/users/m1/deletion', { scheduled: true, password: ADMIN_PASSWORD });

    expect(res.status).toBe(200);
    const { where, data } = vi.mocked(prisma.user.update).mock.calls[0][0] as { where: unknown; data: { deletionRequestedAt: Date | null } };
    expect(where).toEqual({ id: 'm1' });
    expect(data.deletionRequestedAt).toBeInstanceOf(Date);
    await vi.waitFor(() => expect(auditCalls()).toContainEqual(expect.objectContaining({
      action: 'ADMIN_DELETION_SCHEDULE', status: 'success', details: { targetUserId: 'm1', scheduled: true },
    })));
  });

  it('cancels a scheduled deletion', async () => {
    accounts.m1.deletionRequestedAt = new Date('2026-11-01T00:00:00.000Z');

    const res = await as('put', '/api/admin/users/m1/deletion', { scheduled: false, password: ADMIN_PASSWORD });

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'm1' }, data: { deletionRequestedAt: null } }));
  });

  it('keeps the date of a deletion already scheduled', async () => {
    accounts.m1.deletionRequestedAt = new Date('2026-11-01T00:00:00.000Z');

    const res = await as('put', '/api/admin/users/m1/deletion', { scheduled: true, password: ADMIN_PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('DELETION_ALREADY_SCHEDULED');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses with the session alone', async () => {
    const res = await as('put', '/api/admin/users/m1/deletion', { scheduled: true });

    expect(res.status).toBe(403);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses the admin\'s own account and the last admin', async () => {
    expect((await as('put', '/api/admin/users/a1/deletion', { scheduled: true, password: ADMIN_PASSWORD })).body.error).toBe('CANNOT_DELETE_SELF');
    vi.mocked(prisma.user.count).mockResolvedValue(0);
    expect((await as('put', '/api/admin/users/a2/deletion', { scheduled: true, password: ADMIN_PASSWORD })).body.error).toBe('CANNOT_DELETE_LAST_ADMIN');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/users/:userId/export (#661)', () => {
  it('hands the admin a member\'s data export, after their password, and audits it', async () => {
    const res = await as('post', '/api/admin/users/m1/export', { password: ADMIN_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ profile: { id: 'm1' } });
    expect(authService.exportUserData).toHaveBeenCalledWith('m1');
    await vi.waitFor(() => expect(auditCalls()).toContainEqual(expect.objectContaining({
      action: 'ADMIN_MEMBER_EXPORT', status: 'success', details: { targetUserId: 'm1' },
    })));
  });

  it('refuses with the session alone', async () => {
    const res = await as('post', '/api/admin/users/m1/export');

    expect(res.status).toBe(403);
    expect(authService.exportUserData).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown member', async () => {
    const res = await as('post', '/api/admin/users/nobody/export', { password: ADMIN_PASSWORD });

    expect(res.status).toBe(404);
  });
});
