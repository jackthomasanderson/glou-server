import { prisma } from './prisma';
import { encrypt, decrypt } from './crypto';

/**
 * #613: the TOTP secret is stored encrypted with CONFIG_ENCRYPTION_KEY, like
 * the SMTP password, so a copy of the database (a backup, a downloaded dump)
 * no longer gives every member's codes. A value written before is the base32
 * secret in the clear: it does not decrypt and is used as is (`legacy`).
 */
export function openTwoFactorSecret(stored: string): { secret: string; legacy: boolean } {
  try {
    return { secret: decrypt(stored), legacy: false };
  } catch {
    return { secret: stored, legacy: true };
  }
}

/** What newTotpSecret (lib/totp) writes: base32. A ciphertext (base64, 60+ characters) never looks like it. */
const BASE32 = /^[A-Z2-7]+=*$/;

/**
 * #613 / #890: encrypts every 2FA secret still stored in the clear: written
 * before the update, or brought back by restoring an older dump. Waiting for
 * the member's next code is not enough (a trusted device or a long session
 * may never ask one), and every backup would keep the clear secret. Run at
 * start-up, before each backup and after a restore; idempotent. A value that
 * does not decrypt but is not base32 was encrypted with another key: left as
 * it is, so putting the right key back still works. Each write is conditional
 * on the value read. Returns how many were encrypted, null without
 * CONFIG_ENCRYPTION_KEY (development); never throws.
 */
export async function encryptClearTwoFactorSecrets(): Promise<number | null> {
  if (!process.env.CONFIG_ENCRYPTION_KEY) return null;
  try {
    const users = await prisma.user.findMany({
      where: { twoFactorSecret: { not: null } },
      select: { id: true, twoFactorSecret: true },
    });
    let encrypted = 0;
    for (const { id, twoFactorSecret } of users) {
      if (!twoFactorSecret || !BASE32.test(twoFactorSecret) || !openTwoFactorSecret(twoFactorSecret).legacy) continue;
      const { count } = await prisma.user.updateMany({
        where: { id, twoFactorSecret },
        data: { twoFactorSecret: encrypt(twoFactorSecret) },
      });
      encrypted += count;
    }
    if (encrypted > 0) console.info(`[2fa] Encrypted ${encrypted} two-factor secret(s) stored in the clear`);
    return encrypted;
  } catch (err) {
    console.error('[2fa] Could not encrypt the two-factor secrets stored in the clear:', err);
    return 0;
  }
}
