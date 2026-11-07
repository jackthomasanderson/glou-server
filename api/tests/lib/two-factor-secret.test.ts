import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authenticator } from 'otplib';

// #613 / #890 (review): re-encrypting a clear secret only after its next code
// left it in every new backup for a member who signs in on a trusted device,
// and a restored pre-upgrade dump put clear secrets back. A sweep encrypts
// every stored secret still in the clear: at start-up, before each backup and
// after a restore.

const findMany = vi.fn();
const updateMany = vi.fn();
vi.mock('../../src/lib/prisma', () => ({
  prisma: { user: { findMany: (...a: unknown[]) => findMany(...a), updateMany: (...a: unknown[]) => updateMany(...a) } },
}));

import { encrypt, decrypt } from '../../src/lib/crypto';
import { encryptClearTwoFactorSecrets } from '../../src/lib/two-factor-secret';

const KEY = 'ab'.repeat(32);
const CLEAR = authenticator.generateSecret();

beforeEach(() => {
  findMany.mockReset();
  updateMany.mockReset().mockResolvedValue({ count: 1 });
  process.env.CONFIG_ENCRYPTION_KEY = KEY;
});

describe('encryptClearTwoFactorSecrets', () => {
  it('encrypts every secret stored in the clear, only if unchanged in between', async () => {
    findMany.mockResolvedValue([{ id: 'u1', twoFactorSecret: CLEAR }]);

    expect(await encryptClearTwoFactorSecrets()).toBe(1);

    expect(updateMany).toHaveBeenCalledTimes(1);
    const [{ where, data }] = updateMany.mock.calls[0] as [{ where: unknown; data: { twoFactorSecret: string } }];
    expect(where).toEqual({ id: 'u1', twoFactorSecret: CLEAR });
    expect(data.twoFactorSecret).not.toContain(CLEAR);
    expect(decrypt(data.twoFactorSecret)).toBe(CLEAR);
  });

  it('leaves encrypted secrets untouched, so running it again changes nothing', async () => {
    findMany.mockResolvedValue([{ id: 'u1', twoFactorSecret: encrypt(CLEAR) }]);

    expect(await encryptClearTwoFactorSecrets()).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('never re-encrypts a value encrypted with another key (a rotated or wrong key)', async () => {
    process.env.CONFIG_ENCRYPTION_KEY = 'cd'.repeat(32);
    const otherKey = encrypt(CLEAR);
    process.env.CONFIG_ENCRYPTION_KEY = KEY;
    findMany.mockResolvedValue([{ id: 'u1', twoFactorSecret: otherKey }]);

    expect(await encryptClearTwoFactorSecrets()).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('does nothing without CONFIG_ENCRYPTION_KEY (development)', async () => {
    delete process.env.CONFIG_ENCRYPTION_KEY;

    expect(await encryptClearTwoFactorSecrets()).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('never throws: a database error is logged and counted as nothing done', async () => {
    findMany.mockRejectedValue(new Error('db down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await encryptClearTwoFactorSecrets()).toBe(0);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
