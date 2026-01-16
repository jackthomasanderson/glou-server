import bcrypt from "bcrypt";

/**
 * Secure password hashing using bcrypt
 * Replaces the insecure custom PBKDF2 implementation
 */

const SALT_ROUNDS = 12; // Industry standard for bcrypt

/**
 * Hash a password using bcrypt
 * @param password - Plain text password
 * @returns Promise<string> - Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 * @param password - Plain text password to verify
 * @param hash - Hashed password to compare against
 * @returns Promise<boolean> - True if password matches
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
        return await bcrypt.compare(password, hash);
    } catch (error) {
        // If hash format is invalid, return false
        return false;
    }
}

/**
 * Check if a hash is in the old PBKDF2 format
 * Used for migration purposes
 * @param hash - Hash to check
 * @returns boolean - True if hash is in old format
 */
export function isLegacyHash(hash: string): boolean {
    return hash.startsWith("pbkdf2:");
}

/**
 * Verify password against legacy PBKDF2 hash
 * This is only used during migration period
 * @param password - Plain text password
 * @param hash - Legacy PBKDF2 hash
 * @returns Promise<boolean> - True if password matches
 */
export async function verifyLegacyPassword(password: string, hash: string): Promise<boolean> {
    const crypto = await import("crypto");

    const parts = hash.split(":");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") {
        return false;
    }

    const iterations = parseInt(parts[1]);
    const salt = parts[2];
    const storedHash = parts[3];

    const computed = crypto.pbkdf2Sync(password, salt, iterations, 64, "sha256").toString("hex");
    return computed === storedHash;
}
