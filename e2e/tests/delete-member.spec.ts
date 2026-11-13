import { test, expect, request, type APIRequestContext, type APIResponse } from '@playwright/test';
import { creds } from './_helpers';

/**
 * #695: an administrator deletes a member's account for good. #476: the
 * collections are shared by the household and outlive their author. #661:
 * the member's personal data goes with the account.
 *
 * API level, against the real stack and database (the foreign keys and the
 * migration are what is checked): a member signs up, adds a cellar, a
 * collection, a budget envelope and a wish; the suite's user (the instance's
 * admin on a fresh CI database) sees the collection, then deletes the member.
 * One auth call only (the sign-up), like deactivate-member.spec.ts.
 */

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

type AuditItem = { userId: string | null; actorName: string | null; action: string; status: string; details: Record<string, unknown> };

test('an admin deletes a member for good: shared data stays, attributed to the admin, history keeps the name', async ({ page, baseURL }) => {
  const admin = page.request;
  const me = await okData<{ id: string; isAdmin: boolean }>(await admin.get('/api/user/me'));
  test.skip(!me.isAdmin, 'needs the suite user to be the instance admin (fresh database)');

  const { registrationOpen } = await okData<{ registrationOpen: boolean }>(await admin.get('/api/auth/registration-status'));
  const member: APIRequestContext = await request.newContext({ baseURL });
  const username = `e2e695_${`${Date.now()}`.slice(-8)}`;
  const password = creds().password;

  try {
    await okData(await admin.put('/api/admin/config/registration', { data: { registrationOpen: true, password } }));
    const { id: memberId } = await okData<{ id: string }>(await member.post('/api/auth/register', {
      data: { username, email: `${username}@glou.test`, password: 'deleted-member-pw-0000' },
    }));

    const cellar = await okData<{ id: string }>(await member.post('/api/cellars', { data: { name: `E2E 695 ${username}` } }));
    const collection = await okData<{ id: string }>(await member.post('/api/collections', { data: { name: `E2E 695 ${username}` } }));
    const envelope = await okData<{ id: string }>(await member.post('/api/wishlist/budget-envelopes', {
      data: { periodStart: '2026-01-01', periodEnd: '2026-12-31', amount: 100 },
    }));
    await okData(await member.post('/api/wishlist/items', { data: { name: 'Gift for Léa', category: 'wine' } }));

    // #476: the admin sees, and can rename, the member's collection.
    const shared = await okData<Array<{ id: string; userId: string | null }>>(await admin.get('/api/collections'));
    expect(shared.find((c) => c.id === collection.id)?.userId).toBe(memberId);
    await okData(await admin.patch(`/api/collections/${collection.id}`, { data: { name: `E2E 695 renamed ${username}` } }));

    // Not with the session alone, not the admin's own account.
    const sessionOnly = await admin.post(`/api/admin/users/${memberId}/delete`, { data: {} });
    expect(sessionOnly.status()).toBe(403);
    expect((await sessionOnly.json()).error).toBe('REAUTH_REQUIRED');
    const self = await admin.post(`/api/admin/users/${me.id}/delete`, { data: { password } });
    expect((await self.json()).error).toBe('CANNOT_DELETE_SELF');

    await okData(await admin.post(`/api/admin/users/${memberId}/delete`, { data: { password } }));

    // The account is gone, its session with it.
    const users = await okData<Array<{ id: string }>>(await admin.get('/api/admin/users'));
    expect(users.map((u) => u.id)).not.toContain(memberId);
    expect((await member.get('/api/user/me')).status()).toBe(401);

    // What they created in the shared cellar is the admin's now; the collection stays, without an author.
    const cellars = await okData<Array<{ id: string; userId: string }>>(await admin.get('/api/cellars'));
    expect(cellars.find((c) => c.id === cellar.id)?.userId).toBe(me.id);
    const envelopes = await okData<Array<{ id: string; userId: string }>>(await admin.get('/api/wishlist/budget-envelopes'));
    expect(envelopes.find((e) => e.id === envelope.id)?.userId).toBe(me.id);
    const after = await okData<Array<{ id: string; userId: string | null }>>(await admin.get('/api/collections'));
    expect(after.find((c) => c.id === collection.id)?.userId).toBeNull();

    // The deletion is in the log, and the member's past actions stay under their name.
    await expect.poll(async () => {
      const logs = await okData<{ items: AuditItem[] }>(await admin.get('/api/admin/audit-logs?q=ADMIN_MEMBER_DELETE'));
      return logs.items.some((l) => l.action === 'ADMIN_MEMBER_DELETE' && l.status === 'success'
        && l.userId === me.id && l.details.targetUserId === memberId && l.details.username === username);
    }).toBe(true);
    const theirs = await okData<{ items: AuditItem[] }>(await admin.get(`/api/admin/audit-logs?q=${username}`));
    const created = theirs.items.find((l) => l.action === 'COLLECTION_CREATE' && l.details.id === collection.id);
    expect(created).toMatchObject({ userId: null, actorName: username });

    // Leave no empty cellar behind: other specs take the first cellar listed.
    expect((await admin.delete(`/api/cellars/${cellar.id}`)).ok()).toBe(true);
    await admin.delete(`/api/wishlist/budget-envelopes/${envelope.id}`);
    await admin.delete(`/api/collections/${collection.id}`);
  } finally {
    await admin.put('/api/admin/config/registration', { data: { registrationOpen, password } });
    await member.dispose();
  }
});
