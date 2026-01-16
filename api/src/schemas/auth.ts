import { z } from "zod";

/** User account schema */
export const userSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(3).max(50),
  email: z.string().email(),
  role: z.enum(["admin", "user"]).optional(),
  displayName: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  tagline: z.string().nullable().optional(),
  preferredLocale: z.enum(["en", "fr"]).nullable().optional(),
  dateTimeFormat: z.enum(["system", "24h", "12h"]).optional(),
  temperatureUnit: z.enum(["c", "f"]).optional(),
  themeMode: z.enum(["dark", "light", "auto"]).optional(),
  accentColor: z.string().optional(),
  notificationSettings: z.record(z.unknown()).optional(),
  passwordHash: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof userSchema>;

/** User input for registration */
export const userRegistrationSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(12),
});

export type UserRegistration = z.infer<typeof userRegistrationSchema>;

/** Login credentials */
export const loginCredentialsSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

export type LoginCredentials = z.infer<typeof loginCredentialsSchema>;

/** TOTP Secret setup response */
export const totpSetupSchema = z.object({
  secret: z.string(),
  qrCode: z.string(), // Data URL
  manualEntry: z.string(),
});

export type TOTPSetup = z.infer<typeof totpSetupSchema>;

/** TOTP verification request */
export const totpVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

export type TOTPVerify = z.infer<typeof totpVerifySchema>;

/** Recovery codes schema */
export const recoveryCodesSchema = z.object({
  codes: z.array(z.string()).min(10).max(10),
  generatedAt: z.date(),
});

export type RecoveryCodes = z.infer<typeof recoveryCodesSchema>;

/** 2FA settings */
export const twoFASettingsSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  method: z.enum(["totp", "webauthn", "none"]),
  totpSecret: z.string().optional(),
  webauthnCredentials: z.array(z.string()).optional(),
  recoveryCodesHash: z.array(z.string()).optional(),
  enabledAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type TwoFASettings = z.infer<typeof twoFASettingsSchema>;



/** WebAuthn credential schema */
export const webauthnCredentialSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  credentialId: z.string(),
  publicKey: z.string(), // Base64
  counter: z.number(),
  name: z.string().optional(),
  createdAt: z.date(),
});

export type WebauthnCredential = z.infer<typeof webauthnCredentialSchema>;

/** Security event schema for logging */
export const securityEventSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  eventType: z.enum([
    "login_success",
    "login_failed",
    "logout",
    "2fa_enabled",
    "2fa_disabled",
    "password_changed",
    "session_revoked",
    "device_trusted",
    "recovery_codes_generated",
    "suspicious_activity",
  ]),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date(),
});

export type SecurityEvent = z.infer<typeof securityEventSchema>;

/** Failed login attempt tracking */
export const failedLoginAttemptSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  ipAddress: z.string(),
  attemptedAt: z.date(),
  expiresAt: z.date(),
});

export type FailedLoginAttempt = z.infer<typeof failedLoginAttemptSchema>;
