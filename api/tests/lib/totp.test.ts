import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { newTotpSecret, totpUri, isCurrentTotp } from '../../src/lib/totp';

// #604: otplib 12 (deprecated) was replaced by otplib 13, and new secrets are
// back to 20 bytes (RFC 4226 R6), as before the switch from speakeasy. Codes
// are computed here by an independent RFC 6238 implementation (node:crypto),
// so the checks do not depend on the library they test. Nothing is mocked.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(s: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of s.replace(/=+$/, '')) {
    const i = ALPHABET.indexOf(c);
    if (i < 0) throw new Error(`not base32: ${c}`);
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** RFC 6238 code (SHA-1, 30 s, 6 digits) for `secret` at `stepOffset` steps from now. */
function codeAt(secret: string, stepOffset = 0): string {
  const counter = Math.floor(Date.now() / 1000 / 30) + stepOffset;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

describe('lib/totp (#604)', () => {
  it('generates 20-byte secrets (32 base32 characters), each one different', () => {
    const a = newTotpSecret();
    const b = newTotpSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(a)).toHaveLength(20);
    expect(a).not.toBe(b);
  });

  it('accepts the current code of a new secret', () => {
    const secret = newTotpSecret();
    expect(isCurrentTotp(codeAt(secret), secret)).toBe(true);
  });

  it('keeps accepting secrets enrolled before: 10 bytes (otplib 12) and 20 bytes (speakeasy)', () => {
    const otplib12 = base32Encode(crypto.randomBytes(10));
    const speakeasy = base32Encode(crypto.randomBytes(20));
    expect(otplib12).toHaveLength(16);
    expect(isCurrentTotp(codeAt(otplib12), otplib12)).toBe(true);
    expect(isCurrentTotp(codeAt(speakeasy), speakeasy)).toBe(true);
  });

  it('tolerates one 30 s step of clock drift either way, not two', () => {
    const secret = newTotpSecret();
    expect(isCurrentTotp(codeAt(secret, -1), secret)).toBe(true);
    expect(isCurrentTotp(codeAt(secret, 1), secret)).toBe(true);
    const current = new Set([-1, 0, 1].map((d) => codeAt(secret, d)));
    for (const d of [-2, 2]) {
      const far = codeAt(secret, d);
      if (!current.has(far)) expect(isCurrentTotp(far, secret)).toBe(false);
    }
  });

  it('answers false, without throwing, for a wrong code, a backup code or a damaged secret', () => {
    const secret = newTotpSecret();
    const wrong = String((Number(codeAt(secret)) + 1) % 1_000_000).padStart(6, '0');
    const window = new Set([-1, 0, 1].map((d) => codeAt(secret, d)));
    if (!window.has(wrong)) expect(isCurrentTotp(wrong, secret)).toBe(false);
    expect(isCurrentTotp('0123456789abcdef0123', secret)).toBe(false);
    expect(isCurrentTotp('12 456', secret)).toBe(false);
    expect(isCurrentTotp('', secret)).toBe(false);
    expect(isCurrentTotp('123456', 'not base32!')).toBe(false);
    expect(isCurrentTotp('123456', 'ABCD')).toBe(false);
  });

  it('builds the otpauth URI with the same label, issuer and secret as before', () => {
    // otplib 12 also wrote period=30&digits=6&algorithm=SHA1: the defaults of
    // the Key URI format, which otplib 13 leaves out.
    expect(totpUri('jo hn@x', 'GNKA2LZVCAJAUUQT')).toBe('otpauth://totp/Glou:jo%20hn%40x?secret=GNKA2LZVCAJAUUQT&issuer=Glou');
  });
});
