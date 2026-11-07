import { test, expect, request, type APIRequestContext, type APIResponse } from '@playwright/test';

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
  const me = await okData<{ id: string; isAdmin: boolean }>(await admin.get('/api/auth/me'));
  test.skip(!me.isAdmin, 'needs the suite user to be the instance admin (fresh database)');

  const { registrationOpen } = await okData<{ registrationOpen: boolean }>(await admin.get('/api/auth/registration-status'));
  const member: APIRequestContext = await request.newContext({ baseURL });
  const guest: APIRequestContext = await request.newContext({ baseURL });
  const username = `e2e605_${`${Date.now()}`.slice(-8)}`;

  try {
    await okData(await admin.put('/api/admin/config/registration', { data: { registrationOpen: true } }));
    const { id: memberId } = await okData<{ id: string }>(await member.post('/api/auth/register', {
      data: { username, email: `${username}@glou.test`, password: 'deactivated-pw-0000' },
    }));

    const collection = await okData<{ id: string }>(await member.post('/api/collections', { data: { name: 'E2E 605' } }));
    const share = await okData<{ token: string }>(await member.post('/api/shares', {
      data: { label: 'E2E 605', cellarIds: [], collectionIds: [collection.id], hidePrices: false },
    }));
    expect((await member.get('/api/auth/me')).ok()).toBe(true);
    expect((await guest.get(`/api/guest/${share.token}`)).ok()).toBe(true);

    await okData(await admin.patch(`/api/admin/users/${memberId}/status`, { data: { isActive: false } }));
    await okData(await admin.patch(`/api/admin/users/${memberId}/status`, { data: { isActive: true } }));

    const session = await member.get('/api/auth/me');
    expect(session.status()).toBe(401);
    expect((await session.json()).error).toBe('SESSION_REVOKED');
    const link = await guest.get(`/api/guest/${share.token}`);
    expect(link.status()).toBe(403);
    expect((await link.json()).error).toBe('SHARE_EXPIRED_OR_REVOKED');

    // Both changes are in the audit log (written in the background), with the admin as the author.
    await expect.poll(async () => {
      const logs = await okData<{ items: Array<{ userId: string; action: string; details: { targetUserId?: string; isActive?: boolean } }> }>(
        await admin.get('/api/admin/audit-logs?q=ADMIN_STATUS_CHANGE'),
      );
      return logs.items
        .filter((l) => l.action === 'ADMIN_STATUS_CHANGE' && l.userId === me.id && l.details.targetUserId === memberId)
        .map((l) => l.details.isActive)
        .sort();
    }).toEqual([false, true]);
  } finally {
    await admin.put('/api/admin/config/registration', { data: { registrationOpen } });
    await member.dispose();
    await guest.dispose();
  }
});
