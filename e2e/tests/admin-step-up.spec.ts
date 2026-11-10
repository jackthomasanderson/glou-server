import { test, expect, type APIResponse } from '@playwright/test';
import { gunzipSync } from 'node:zlib';
import { creds } from './_helpers';

/**
 * #890: after #638, a stolen admin session (the cookie alone, no password, no
 * phone) could still take over an account: point outgoing mail at the
 * attacker's server (step 1), ask "forgot password" for an admin without 2FA
 * (step 2), and read the reset link. It could also download a dump holding
 * every 2FA secret in the clear (#613).
 *
 * API level, against the real stack and database: with the session alone,
 * every one of those routes is refused and nothing changes; the admin's
 * password lets the change through; refusals and changes are in the audit
 * log; and a downloaded dump no longer contains a 2FA secret in the clear.
 * The suite's user is the instance admin (fresh CI database) without 2FA, so
 * the step-up asks the password only. Kept short: each refusal spends the
 * step-up limiter (20 refusals per 15 minutes, shared with backup-restore).
 */

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

async function expectRefused(res: APIResponse, error: string, label: string) {
  expect(res.status(), label).toBe(403);
  expect((await res.json()).error, label).toBe(error);
}

test('a stolen admin session cannot redirect mail, links or alerts, nor download a backup (#890, #613)', async ({ page }) => {
  const admin = page.request;
  const me = await okData<{ id: string; isAdmin: boolean; isTwoFactorEnabled: boolean }>(await admin.get('/api/auth/me'));
  test.skip(!me.isAdmin || me.isTwoFactorEnabled, 'needs the suite user to be the instance admin, without 2FA (fresh database)');

  type Config = {
    smtpHost: string | null; publicUrl: string | null; smtpEnabled: boolean; gotifyEnabled: boolean;
    logRetentionDays: number; sessionRetentionDays: number; guestShareRetentionDays: number;
    backupEnabled: boolean; backupRetentionDays: number; backupHour: number; registrationOpen: boolean;
  };
  const before = await okData<Config>(await admin.get('/api/admin/config'));
  const run = await okData<{ id: string; success: boolean }>(await admin.post('/api/admin/backups/run'));
  expect(run.success).toBe(true);

  // Step 1 of the takeover, and every other route of the issue: refused with the session alone.
  const sessionOnly: Array<[string, Promise<APIResponse>]> = [
    ['SMTP settings', admin.put('/api/admin/config/smtp', { data: { smtpHost: 'mail.attacker.example' } })],
    ['SMTP test', admin.post('/api/admin/config/test/smtp', { data: { email: 'me@attacker.example' } })],
    ['public URL', admin.put('/api/admin/config/network', { data: { publicUrl: 'https://attacker.example' } })],
    ['Gotify settings', admin.put('/api/admin/config/gotify', { data: { gotifyEnabled: false } })],
    ['Gotify test', admin.post('/api/admin/config/test/gotify', { data: {} })],
    ['notification channels', admin.put('/api/admin/config/notifications', { data: { smtpEnabled: false, gotifyEnabled: false } })],
    ['backup download', admin.post(`/api/admin/backups/${run.id}/download`, { data: {} })],
    ['backup restore', admin.post(`/api/admin/backups/${run.id}/restore`, { data: { confirm: true } })],
    ['full purge', admin.post('/api/admin/maintenance/purge', { data: { confirmation: 'SUPPRIMER' } })],
    // #893: erasing the audit trail, turning backups off, opening sign-up.
    ['audit log retention lowered', admin.put('/api/admin/config/retention', {
      data: { logRetentionDays: 1, sessionRetentionDays: before.sessionRetentionDays, guestShareRetentionDays: before.guestShareRetentionDays },
    })],
    ['scheduled backups turned off', admin.put('/api/admin/config/backup', {
      data: { backupEnabled: false, backupRetentionDays: before.backupRetentionDays, backupHour: before.backupHour },
    })],
  ];
  // Sign-up is closed on a fresh database (and the specs that open it close it again).
  if (!before.registrationOpen) {
    sessionOnly.push(['sign-up opened', admin.put('/api/admin/config/registration', { data: { registrationOpen: true } })]);
  }
  for (const [label, res] of sessionOnly) await expectRefused(await res, 'REAUTH_REQUIRED', label);
  await expectRefused(
    await admin.put('/api/admin/config/smtp', { data: { smtpHost: 'mail.attacker.example', password: 'not-the-admin-password' } }),
    'INVALID_PASSWORD', 'SMTP settings, wrong password',
  );

  const after = await okData<Config>(await admin.get('/api/admin/config'));
  expect(after).toEqual(before);

  // The admin's own password lets a change through (here, the same public URL again).
  await okData(await admin.put('/api/admin/config/network', {
    data: { publicUrl: before.publicUrl, password: creds().password },
  }));

  type Log = { action: string; status: string; details: { section?: string; error?: string } };
  const logs = await okData<{ items: Log[] }>(await admin.get('/api/admin/audit-logs?q=CONFIG_UPDATE&limit=100'));
  expect(logs.items).toContainEqual(expect.objectContaining({ status: 'error', details: expect.objectContaining({ section: 'smtp', error: 'REAUTH_REQUIRED' }) }));
  expect(logs.items).toContainEqual(expect.objectContaining({ status: 'error', details: expect.objectContaining({ section: 'smtp', error: 'INVALID_PASSWORD' }) }));
  expect(logs.items).toContainEqual(expect.objectContaining({ status: 'success', details: { section: 'network' } }));

  // #613: a 2FA secret reaches the database encrypted, so a dump holds no usable one.
  // Generating a secret does not turn 2FA on: the suite user still signs in without a code.
  const { secret } = await okData<{ secret: string }>(await admin.post('/api/auth/2fa/generate'));
  const withSecret = await okData<{ id: string; success: boolean }>(await admin.post('/api/admin/backups/run'));
  expect(withSecret.success).toBe(true);
  const download = await admin.post(`/api/admin/backups/${withSecret.id}/download`, { data: { password: creds().password } });
  expect(download.ok()).toBe(true);
  const sql = gunzipSync(await download.body()).toString('utf8');
  expect(sql).toContain('CREATE TABLE public."User"');
  expect(sql).not.toContain(secret);
});
