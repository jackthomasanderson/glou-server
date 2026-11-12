import { test, expect, request, type APIRequestContext, type APIResponse } from '@playwright/test';
import { creds } from './_helpers';

/**
 * #605: deactivating a member only put their sessions, trusted devices and
 * guest links to sleep; reactivating the account brought every one of them
 * back, a session stolen in the meantime included.
 *
 * API level, against the real stack and database: a member signs up (one
 * session) and creates a guest link; the suite's user (the instance's admin
 * on a fresh CI database) deactivates then reactivates the account. The old
 * session and the old guest link stay dead. Trusted devices are revoked by
 * the same transaction (covered in api/tests/integration); setting one up
 * here would spend the shared auth rate limit. One auth call only.
 */

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

test('deactivate then reactivate a member: their old session and guest link stay revoked', async ({ page, baseURL }) => {
  const admin = page.request;
  const me = await okData<{ id: string; isAdmin: boolean }>(await admin.get('/api/user/me'));
  test.skip(!me.isAdmin, 'needs the suite user to be the instance admin (fresh database)');

  const { registrationOpen } = await okData<{ registrationOpen: boolean }>(await admin.get('/api/auth/registration-status'));
  const member: APIRequestContext = await request.newContext({ baseURL });
  const guest: APIRequestContext = await request.newContext({ baseURL });
  const username = `e2e605_${`${Date.now()}`.slice(-8)}`;

  try {
    // #893: opening sign-up asks for the admin's password.
    await okData(await admin.put('/api/admin/config/registration', { data: { registrationOpen: true, password: creds().password } }));
    const { id: memberId } = await okData<{ id: string }>(await member.post('/api/auth/register', {
      data: { username, email: `${username}@glou.test`, password: 'deactivated-pw-0000' },
    }));

    const collection = await okData<{ id: string }>(await member.post('/api/collections', { data: { name: 'E2E 605' } }));
    const share = await okData<{ token: string }>(await member.post('/api/shares', {
      data: { label: 'E2E 605', cellarIds: [], collectionIds: [collection.id], hidePrices: false },
    }));
    expect((await member.get('/api/user/me')).ok()).toBe(true);
    expect((await guest.get(`/api/guest/${share.token}`)).ok()).toBe(true);

    // #603: a status change asks for the admin's password (the suite user has no 2FA).
    const sessionOnly = await admin.patch(`/api/admin/users/${memberId}/status`, { data: { isActive: false } });
    expect(sessionOnly.status()).toBe(403);
    expect((await sessionOnly.json()).error).toBe('REAUTH_REQUIRED');
    expect((await member.get('/api/user/me')).ok()).toBe(true);
    const adminPassword = creds().password;
    await okData(await admin.patch(`/api/admin/users/${memberId}/status`, { data: { isActive: false, password: adminPassword } }));
    await okData(await admin.patch(`/api/admin/users/${memberId}/status`, { data: { isActive: true, password: adminPassword } }));

    const session = await member.get('/api/user/me');
    expect(session.status()).toBe(401);
    expect((await session.json()).error).toBe('SESSION_REVOKED');
    const link = await guest.get(`/api/guest/${share.token}`);
    expect(link.status()).toBe(403);
    expect((await link.json()).error).toBe('SHARE_EXPIRED_OR_REVOKED');

    // Both changes are in the audit log (written in the background), with the admin as the author.
    await expect.poll(async () => {
      const logs = await okData<{ items: Array<{ userId: string; action: string; status: string; details: { targetUserId?: string; isActive?: boolean; error?: string } }> }>(
        await admin.get('/api/admin/audit-logs?q=ADMIN_STATUS_CHANGE'),
      );
      return logs.items
        .filter((l) => l.action === 'ADMIN_STATUS_CHANGE' && l.userId === me.id && l.details.targetUserId === memberId)
        .map((l) => `${l.status}:${l.details.isActive}${l.details.error ? `:${l.details.error}` : ''}`)
        .sort();
      // #603: the session-only attempt is there too, as a refusal.
    }).toEqual(['error:false:REAUTH_REQUIRED', 'success:false', 'success:true']);

    // #601: the guest link's creation is in the log too, filed under the member, without its token.
    const shareLogs = await okData<{ items: Array<{ userId: string; action: string; details: Record<string, unknown> }> }>(
      await admin.get('/api/admin/audit-logs?q=SHARE_CREATE'),
    );
    const created = shareLogs.items.find((l) => l.action === 'SHARE_CREATE' && l.userId === memberId);
    expect(created?.details).toMatchObject({ collectionIds: [collection.id] });
    expect(JSON.stringify(shareLogs.items)).not.toContain(share.token);
  } finally {
    await admin.put('/api/admin/config/registration', { data: { registrationOpen } });
    await member.dispose();
    await guest.dispose();
  }
});
