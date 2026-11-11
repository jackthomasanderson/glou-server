import { createGuardrails, generateSecret, generateURI, verifySync } from 'otplib';

// #604: authenticator codes (RFC 6238: SHA-1, 30 s steps, 6 digits) through
// otplib 13. otplib 12, used since speakeasy was dropped (ISSUE_090), is
// deprecated upstream.

/** RFC 4226 (R6) recommends 160 bits; otplib 12 generated 80 by default. */
const SECRET_BYTES = 20;

/**
 * otplib 13 refuses secrets under 16 bytes, but members who turned 2FA on
 * with otplib 12 have 10-byte ones: they must keep working (a new secret is
 * only issued when 2FA is turned on again).
 */
const ENROLLED_SECRETS = createGuardrails({ MIN_SECRET_BYTES: 10 });

/** One 30 s step of clock drift either way, as before (`window: 1`). */
const DRIFT_SECONDS = 30;

/** A new base32 secret for the authenticator app. */
export function newTotpSecret(): string {
  return generateSecret({ length: SECRET_BYTES });
}

/** The otpauth:// URI put in the QR code. */
export function totpUri(username: string, secret: string): string {
  return generateURI({ issuer: 'Glou', label: username, secret });
}

/**
 * Whether `token` is the authenticator's current code for `secret`. otplib 13
 * throws on a malformed token (a backup code, letters) or secret, where
 * otplib 12 answered false: every refusal is a plain false here.
 */
export function isCurrentTotp(token: string, secret: string): boolean {
  try {
    return verifySync({ secret, token, epochTolerance: DRIFT_SECONDS, guardrails: ENROLLED_SECRETS }).valid;
  } catch {
    return false;
  }
}
