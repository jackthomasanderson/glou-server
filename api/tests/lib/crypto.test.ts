import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, decrypt, maskSecret } from '../../src/lib/crypto';

// aes-256-gcm needs a 32-byte key (64 hex chars).
const TEST_KEY = 'a'.repeat(64);

describe('crypto (AES-256-GCM config secret encryption)', () => {
  beforeAll(() => {
    process.env.CONFIG_ENCRYPTION_KEY = TEST_KEY;
  });

  it('round-trips a plaintext value', () => {
    const secret = 'smtp-password-🔐-with-unicode';
    expect(decrypt(encrypt(secret))).toBe(secret);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'));
  });

  it('rejects a tampered ciphertext (auth tag mismatch)', () => {
    const token = encrypt('sensitive');
    const raw = Buffer.from(token, 'base64');
    raw[raw.length - 1] ^= 0xff; // flip a bit in the encrypted body
    expect(() => decrypt(raw.toString('base64'))).toThrow();
  });

  it('throws when the key is missing or the wrong size', () => {
    const saved = process.env.CONFIG_ENCRYPTION_KEY;
    process.env.CONFIG_ENCRYPTION_KEY = '';
    expect(() => encrypt('x')).toThrow('CONFIG_ENCRYPTION_KEY not set');
    process.env.CONFIG_ENCRYPTION_KEY = 'abcd';
    expect(() => encrypt('x')).toThrow('must be 32 bytes');
    process.env.CONFIG_ENCRYPTION_KEY = saved;
  });

  it('maskSecret hides any non-empty value and passes null/empty through', () => {
    expect(maskSecret('hunter2')).toBe('••••••••');
    expect(maskSecret(null)).toBeNull();
    expect(maskSecret('')).toBeNull();
  });
});
