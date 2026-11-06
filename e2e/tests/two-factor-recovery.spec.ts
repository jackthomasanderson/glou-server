import { test, expect, request, type APIRequestContext, type APIResponse } from '@playwright/test';
import { createHmac } from 'node:crypto';

/**
 * #638: losing the phone with 2FA on meant losing the account — an admin
 * password reset left 2FA in place, so sign-in still stopped at the code step,
 * and backup codes could be neither regenerated nor counted.
 *
 * API level, against the real stack: a member turns 2FA on, regenerates their
 * backup codes (the old ones stop working), then the suite's user (the
 * instance's admin on a fresh CI database) resets their password, and the
 * member signs in with the temporary one without being asked for a code.
 * Kept short on purpose: every sign-in and 2FA call spends the shared
 * per-IP auth rate limit (20 per 15 minutes).
 */

const stamp = () => `${Date.now()}`.slice(-8);

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s), the authenticator app's side. */
function totp(base32Secret: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of base32Secret.replace(/=+$/, '').toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  }
  const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, '0');
}

test('a lost phone is recoverable: new backup codes, then an admin reset turns 2FA off', async ({ page, baseURL }) => {
  const admin = page.request;
  const me = await okData<{ id: string; isAdmin: boolean }>(await admin.get('/api/auth/me'));
  test.skip(!me.isAdmin, 'needs the suite user to be the instance admin (fresh database)');

  const { registrationOpen } = await okData<{ registrationOpen: boolean }>(await admin.get('/api/auth/registration-status'));
  const member: APIRequestContext = await request.newContext({ baseURL });
  const signIn: APIRequestContext[] = [];
  const username = `e2e638_${stamp()}`;
  const password = 'lost-phone-pw-0000';

  try {
    await okData(await admin.put('/api/admin/config/registration', { data: { registrationOpen: true } }));
    await okData(await member.post('/api/auth/register', {
      data: { username, email: `${username}@glou.test`, password },
    }));

    // Turn 2FA on, as the authenticator app would.
    const { secret } = await okData<{ secret: string }>(await member.post('/api/auth/2fa/generate'));
    const { backupCodes: firstCodes } = await okData<{ backupCodes: string[] }>(
      await member.post('/api/auth/2fa/turn-on', { data: { code: totp(secret) } }),
    );
    expect(firstCodes).toHaveLength(10);

    // Regenerate with the password and a backup code: ten new codes, the old ones dead.
    const { backupCodes: newCodes } = await okData<{ backupCodes: string[] }>(
      await member.post('/api/auth/2fa/backup-codes', { data: { password, code: firstCodes[0] } }),
    );
    expect(newCodes).toHaveLength(10);
    for (const code of newCodes) expect(firstCodes).not.toContain(code);

    const reused = await member.post('/api/auth/2fa/backup-codes', { data: { password, code: firstCodes[1] } });
    expect(reused.status()).toBe(400);
    expect((await reused.json()).error).toBe('INVALID_TOTP_CODE');

    expect(await okData<{ remaining: number }>(await member.get('/api/user/backup-codes'))).toEqual({ remaining: 10 });

    // The admin resets the member's password.
    const users = await okData<Array<{ id: string; username: string }>>(await admin.get('/api/admin/users'));
    const target = users.find((u) => u.username === username);
    expect(target).toBeTruthy();
    const { tempPassword } = await okData<{ tempPassword: string }>(
      await admin.post(`/api/admin/users/${target!.id}/reset-password`),
    );

    // Signing in with the temporary password asks for no code any more.
    const fresh = await request.newContext({ baseURL });
    signIn.push(fresh);
    const signedIn = await okData<{ requires2fa?: boolean; isTwoFactorEnabled: boolean; mustChangePassword: boolean }>(
      await fresh.post('/api/auth/login', { data: { identifier: username, password: tempPassword } }),
    );
    expect(signedIn.requires2fa).toBeFalsy();
    expect(signedIn.isTwoFactorEnabled).toBe(false);
    expect(signedIn.mustChangePassword).toBe(true);
    expect(await okData<{ remaining: number }>(await fresh.get('/api/user/backup-codes'))).toEqual({ remaining: 0 });
  } finally {
    await admin.put('/api/admin/config/registration', { data: { registrationOpen } });
    await member.dispose();
    for (const ctx of signIn) await ctx.dispose();
  }
});
