import crypto from "crypto";
import { hashPassword as bcryptHash, verifyPassword as bcryptVerify, isLegacyHash, verifyLegacyPassword } from "../lib/bcrypt.js";

/**
 * Cryptographic utilities for password hashing and TOTP
 * Password hashing now uses bcrypt via lib/bcrypt.ts
 */
export class CryptoService {
  /**
   * Hash a password using bcrypt
   */
  static async hashPassword(password: string): Promise<string> {
    return bcryptHash(password);
  }

  /**
   * Verify a password against a hash
   * Supports both bcrypt and legacy PBKDF2 hashes
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    // Check if it's a legacy hash
    if (isLegacyHash(hash)) {
      return verifyLegacyPassword(password, hash);
    }

    // Use bcrypt verification
    return bcryptVerify(password, hash);
  }

  /**
   * Generate a random token
   */
  static generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString("hex");
  }

  /**
   * Generate recovery codes
   */
  static generateRecoveryCodes(count: number = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      // Generate codes in format: XXXX-XXXX-XXXX (12 chars + 2 hyphens)
      const code = crypto.randomBytes(9).toString("hex").toUpperCase();
      codes.push(`${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`);
    }
    return codes;
  }

  /**
   * Hash recovery codes for storage
   */
  static hashRecoveryCode(code: string): string {
    return crypto.createHash("sha256").update(code).digest("hex");
  }

  /**
   * Verify recovery code
   */
  static verifyRecoveryCode(code: string, hashedCode: string): boolean {
    const hash = crypto.createHash("sha256").update(code).digest("hex");
    return hash === hashedCode;
  }
}

/**
 * TOTP service using speakeasy-like implementation
 * In production, use 'speakeasy' npm package
 */
export class TOTPService {
  private static readonly BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

  /**
   * Generate a TOTP secret
   */
  static generateSecret(length: number = 32): string {
    const bytes = crypto.randomBytes(length);
    let secret = "";
    for (let i = 0; i < bytes.length; i++) {
      secret += this.BASE32_ALPHABET[bytes[i] % 32];
    }
    return secret;
  }

  /**
   * Verify a TOTP code
   */
  static verifyCode(secret: string, code: string, window: number = 1): boolean {
    const time = Math.floor(Date.now() / 1000 / 30);

    for (let i = -window; i <= window; i++) {
      const hmac = crypto.createHmac("sha1", this.base32Decode(secret));
      const counter = Buffer.alloc(8);
      counter.writeBigInt64BE(BigInt(time + i));
      hmac.update(counter);

      const digest = hmac.digest();
      const offset = digest[digest.length - 1] & 0x0f;
      const otp = (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000;

      if (String(otp).padStart(6, "0") === code) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate QR code data URL for TOTP
   * This returns a simple base64 representation
   * In production, use 'qrcode' npm package
   */
  static generateQRCodeDataURL(secret: string, issuer: string, accountName: string): string {
    // Format: otpauth://totp/issuer:account?secret=SECRET&issuer=ISSUER
    const uri = `otpauth://totp/${issuer}:${accountName}?secret=${secret}&issuer=${issuer}`;
    // In production, use qrcode library to generate actual QR code
    // For now, return the URI as placeholder
    return `data:text/plain;base64,${Buffer.from(uri).toString("base64")}`;
  }

  /**
   * Decode base32 string
   */
  private static base32Decode(input: string): Buffer {
    let output = Buffer.alloc(0);
    let buffer = 0;
    let bufferLength = 0;

    for (const char of input) {
      const value = this.BASE32_ALPHABET.indexOf(char.toUpperCase());
      if (value === -1) throw new Error("Invalid base32 character");

      buffer = (buffer << 5) | value;
      bufferLength += 5;

      if (bufferLength >= 8) {
        bufferLength -= 8;
        output = Buffer.concat([output, Buffer.from([buffer >> bufferLength])]);
        buffer &= (1 << bufferLength) - 1;
      }
    }

    if (bufferLength > 0) {
      output = Buffer.concat([output, Buffer.from([buffer << (8 - bufferLength)])]);
    }

    return output;
  }
}
