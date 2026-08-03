import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { RegisterInput, LoginInput } from '../schemas/auth.schema';
import { UpdateProfileInput, UpdatePreferencesInput } from '../schemas/user.schema';
import { Theme, Language, TempUnit, DateFormat } from '@prisma/client';
import { describeDevice, locateIp, countryOfIp } from '../lib/device';
import { notificationService } from './notification.service';
import { systemConfigService } from './system-config.service';
import { auditLog } from './audit.service';

const JWT_EXPIRES_IN = '30d';
// Session / trusted-device lifetime, kept in sync with JWT_EXPIRES_IN (30d) for consistency
// (FEAT-25: a Session must not outlive the JWT that references it).
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

export interface AuthPayload {
  userId: string;
  email: string;
  username: string;
  scope?: 'full' | '2fa_pending';
  rememberMe?: boolean;
  sessionId?: string;
}

/** Minimal device/network fingerprint captured at session / trusted-device creation time. */
export interface DeviceInfo {
  userAgent?: string | null;
  ip?: string | null;
}

// FEAT-18: categories selectable for a filtered personal data export.
export type ExportCategory = 'inventory' | 'cellars' | 'collections' | 'tastings' | 'activity';
const ALL_EXPORT_CATEGORIES: ExportCategory[] = ['inventory', 'cellars', 'collections', 'tastings', 'activity'];

export type LoginResult =
  | { user: PublicUser; token: string; rememberMe: boolean; requires2fa?: never; viaTrustedDevice?: boolean }
  | { user: PublicUser; token: string; rememberMe: boolean; requires2fa: true };

export interface SessionSummary {
  id: string;
  device: string;
  location: { city: string | null; country: string | null } | null;
  createdAt: Date;
  lastActiveAt: Date;
  rememberMe: boolean;
  isCurrent: boolean;
}

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  appName: string | null;
  appSlogan: string | null;
  theme: Theme;
  language: Language;
  tempUnit: TempUnit;
  accentColor: string;
  dateFormat: DateFormat;
  isAdmin: boolean;
  createdAt: Date;
  deletionRequestedAt?: Date | null;
  // FEAT-30: Quick Lock & Auto-Lock
  hasPin: boolean;
  autoLockDelayMin: number | null;
  // FEAT-56: Setup Wizard d'Onboarding — null while the wizard hasn't been
  // completed or skipped yet.
  onboardingCompletedAt: Date | null;
}

/** Shape shared by every Prisma User read used to build a PublicUser (FEAT-30 added pinHash/autoLockDelayMin). */
interface RawUserForPublic {
  id: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  appName: string | null;
  appSlogan: string | null;
  theme: Theme;
  language: Language;
  tempUnit: TempUnit;
  accentColor: string;
  dateFormat: DateFormat;
  isAdmin: boolean;
  createdAt: Date;
  deletionRequestedAt: Date | null;
  pinHash: string | null;
  autoLockDelayMin: number | null;
  onboardingCompletedAt: Date | null;
}

function signToken(payload: AuthPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET_NOT_SET');
  return jwt.sign(payload, secret, { expiresIn: JWT_EXPIRES_IN });
}

// ─── Security Notifications (FEAT-29) ────────────────────────────────────────

type SecurityEventKey = 'newDevice' | 'passwordChanged' | 'twoFactorEnabled' | 'twoFactorDisabled' | 'sessionRevoked';

const SECURITY_EVENT_CONTENT: Record<SecurityEventKey, (isEn: boolean) => { subject: string; intro: string }> = {
  newDevice: (isEn) => isEn
    ? { subject: 'Glou — New sign-in detected', intro: "A new sign-in to your account was detected from a device or location we don't recognize." }
    : { subject: 'Glou — Nouvelle connexion détectée', intro: 'Une connexion à votre compte a été détectée depuis un appareil ou une localisation que nous ne reconnaissons pas.' },
  passwordChanged: (isEn) => isEn
    ? { subject: 'Glou — Your password was changed', intro: 'The password of your account was just changed.' }
    : { subject: 'Glou — Mot de passe modifié', intro: 'Le mot de passe de votre compte vient d’être modifié.' },
  twoFactorEnabled: (isEn) => isEn
    ? { subject: 'Glou — Two-factor authentication enabled', intro: 'Two-factor authentication was just enabled on your account.' }
    : { subject: 'Glou — Double authentification activée', intro: 'La double authentification vient d’être activée sur votre compte.' },
  twoFactorDisabled: (isEn) => isEn
    ? { subject: 'Glou — Two-factor authentication disabled', intro: 'Two-factor authentication was just disabled on your account.' }
    : { subject: 'Glou — Double authentification désactivée', intro: 'La double authentification vient d’être désactivée sur votre compte.' },
  sessionRevoked: (isEn) => isEn
    ? { subject: 'Glou — A session was signed out', intro: 'A session on your account was signed out.' }
    : { subject: 'Glou — Session déconnectée', intro: 'Une session de votre compte a été déconnectée.' },
};

export class AuthService {
  /**
   * Whitelist a raw Prisma User record down to the public, client-safe shape.
   * Never spreads the raw record — `pinHash` (and any other sensitive column)
   * must be explicitly excluded, mirroring the explicit-fields discipline
   * already used for `passwordHash` throughout this file.
   */
  private toPublicUser(user: RawUserForPublic): PublicUser {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      appName: user.appName,
      appSlogan: user.appSlogan,
      theme: user.theme,
      language: user.language,
      tempUnit: user.tempUnit,
      accentColor: user.accentColor,
      dateFormat: user.dateFormat,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
      deletionRequestedAt: user.deletionRequestedAt,
      hasPin: !!user.pinHash,
      autoLockDelayMin: user.autoLockDelayMin,
      onboardingCompletedAt: user.onboardingCompletedAt,
    };
  }

  /**
   * Create a new Session row for a user and return its id.
   * `expiresAt` mirrors the JWT's own expiration (SESSION_DURATION_MS) so the
   * Session never outlives the token that carries its id.
   */
  private async createSession(userId: string, deviceInfo: DeviceInfo, rememberMe: boolean): Promise<{ id: string }> {
    return prisma.session.create({
      data: {
        userId,
        userAgent: deviceInfo.userAgent ?? null,
        ip: deviceInfo.ip ?? null,
        rememberMe,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      },
      select: { id: true },
    });
  }

  /**
   * Create a TrustedDevice row and return the raw (unhashed) token — only
   * exposed to the caller once, at creation time.
   */
  private async createTrustedDevice(userId: string, deviceInfo: DeviceInfo): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await prisma.trustedDevice.create({
      data: {
        userId,
        tokenHash,
        userAgent: deviceInfo.userAgent ?? null,
        ip: deviceInfo.ip ?? null,
        country: countryOfIp(deviceInfo.ip),
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      },
    });
    return rawToken;
  }

  /**
   * True if `userId` already has a Session on record (regardless of its
   * revoked/expired status) from the same user-agent AND the same resolved
   * IP country as `deviceInfo`. Used to detect "new device / unknown
   * location" logins (FEAT-29).
   */
  private async isKnownDeviceLocation(userId: string, deviceInfo: DeviceInfo): Promise<boolean> {
    const userAgent = deviceInfo.userAgent ?? null;
    const country = countryOfIp(deviceInfo.ip);
    const sessions = await prisma.session.findMany({
      where: { userId },
      select: { userAgent: true, ip: true },
    });
    return sessions.some((s) => s.userAgent === userAgent && countryOfIp(s.ip) === country);
  }

  /**
   * Revoke every active Session belonging to `userId` except `currentSessionId`.
   * Called after a password change or a 2FA disable so a stolen session
   * cookie does not survive the credential rotation (mirrors the manual
   * revoke path used by `DELETE /api/auth/sessions/:id`, FEAT-25). Records a
   * single `SESSION_REVOKE` AuditLog entry covering the whole batch.
   */
  private async revokeOtherSessions(userId: string, currentSessionId: string, ip: string): Promise<void> {
    const sessions = await prisma.session.findMany({
      where: { userId, revokedAt: null, NOT: { id: currentSessionId } },
      select: { id: true },
    });
    if (sessions.length === 0) return;

    await prisma.session.updateMany({
      where: { id: { in: sessions.map((s) => s.id) } },
      data: { revokedAt: new Date() },
    });

    void auditLog({
      userId,
      action: 'SESSION_REVOKE',
      status: 'success',
      ip,
      details: {
        reason: 'bulk_revoke_on_credential_change',
        revokedSessionIds: sessions.map((s) => s.id),
        excludedSessionId: currentSessionId,
      },
    });
  }

  /**
   * Fire-and-forget a security notification (FEAT-29). Never throws and never
   * blocks its caller — mirrors the rest of the audit/notification pipeline.
   * Always bypasses quiet hours: a compromised account must not wait for morning.
   */
  private notifySecurityEvent(userId: string, eventKey: SecurityEventKey, deviceInfo: DeviceInfo): void {
    void this.sendSecurityNotification(userId, eventKey, deviceInfo).catch((err) => {
      console.error(`[auth] Failed to send security notification (${eventKey}):`, err);
    });
  }

  private async sendSecurityNotification(userId: string, eventKey: SecurityEventKey, deviceInfo: DeviceInfo): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { language: true, notifLanguage: true } });
    if (!user) return;
    const isEn = (user.notifLanguage ?? user.language) === 'EN';

    const appUrl = await systemConfigService.getEffectivePublicUrl();
    const securityUrl = `${appUrl}/profile#security`;
    const timestamp = new Date().toLocaleString(isEn ? 'en-US' : 'fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
    const device = describeDevice(deviceInfo.userAgent);
    const location = locateIp(deviceInfo.ip);
    const locationLabel = location?.city && location?.country
      ? `${location.city}, ${location.country}`
      : location?.country ?? (isEn ? 'Unknown location' : 'Localisation inconnue');

    const { subject, intro } = SECURITY_EVENT_CONTENT[eventKey](isEn);

    const htmlBody = [
      `<p>${intro}</p>`,
      '<ul>',
      `<li>Date: ${timestamp}</li>`,
      `<li>${isEn ? 'Device' : 'Appareil'}: ${device}</li>`,
      `<li>${isEn ? 'Location' : 'Localisation'}: ${locationLabel}</li>`,
      '</ul>',
      `<p><a href="${securityUrl}">${isEn ? 'Review your security settings' : 'Consulter mes paramètres de sécurité'}</a></p>`,
      `<p style="color:#666;font-size:12px;">${isEn
        ? 'If this was not you, secure your account immediately: change your password and sign out other sessions.'
        : "Si vous n'êtes pas à l'origine de cette action, sécurisez votre compte immédiatement : changez votre mot de passe et déconnectez les autres sessions."}</p>`,
    ].join('');

    await notificationService.send({ userId, category: 'security', subject, htmlBody, bypassQuietHours: true });
  }

  /**
   * Register a new user.
   */
  async register(data: RegisterInput, deviceInfo: DeviceInfo): Promise<{ user: PublicUser; token: string }> {
    const { username, email, password } = data;

    // Check uniqueness
    const existing = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
      select: { username: true, email: true },
    });
    if (existing) {
      if (existing.username === username) throw new Error('USERNAME_ALREADY_TAKEN');
      throw new Error('EMAIL_ALREADY_TAKEN');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // If this is the first user, make them an admin
    const userCount = await prisma.user.count();
    const isAdmin = userCount === 0;

    const rawUser = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        isAdmin,
      },
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        appName: true,
        appSlogan: true,
        theme: true,
        language: true,
        tempUnit: true,
        accentColor: true,
        dateFormat: true,
        isAdmin: true,
        createdAt: true,
        deletionRequestedAt: true,
        pinHash: true,
        autoLockDelayMin: true,
        onboardingCompletedAt: true,
      },
    });
    const user = this.toPublicUser(rawUser);

    // Registration creates a session directly (scope 'full', no 2FA prompt at signup);
    // its cookie is persistent (COOKIE_OPTIONS), so the Session is flagged rememberMe=true.
    const session = await this.createSession(user.id, deviceInfo, true);
    const token = signToken({ userId: user.id, email: user.email, username: user.username, scope: 'full', sessionId: session.id });
    return { user, token };
  }

  /**
   * Login with username OR email + password.
   * If the user has 2FA enabled and a valid, non-expired, non-revoked
   * `trustedDeviceToken` is supplied, the 2FA challenge is bypassed — unless
   * the connection's country differs from the one recorded on the trusted
   * device, in which case the trust is silently revoked and the normal 2FA
   * flow resumes.
   */
  async login(data: LoginInput, deviceInfo: DeviceInfo, trustedDeviceToken?: string): Promise<LoginResult> {
    const { identifier, password, rememberMe = false } = data;

    // Accept username or email
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ username: identifier }, { email: identifier }],
      },
    });

    if (!user) throw new Error('INVALID_CREDENTIALS');
    if (!user.isActive) throw new Error('ACCOUNT_DEACTIVATED');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new Error('INVALID_CREDENTIALS');

    const publicUser: PublicUser = this.toPublicUser(user);

    if (user.isTwoFactorEnabled) {
      if (trustedDeviceToken) {
        const tokenHash = crypto.createHash('sha256').update(trustedDeviceToken).digest('hex');
        const trustedDevice = await prisma.trustedDevice.findUnique({ where: { tokenHash } });

        if (trustedDevice && trustedDevice.userId === user.id && !trustedDevice.revokedAt && trustedDevice.expiresAt > new Date()) {
          const currentCountry = countryOfIp(deviceInfo.ip);
          const isAnomalous = !!trustedDevice.country && !!currentCountry && trustedDevice.country !== currentCountry;

          if (isAnomalous) {
            // Suspicious connection environment change: invalidate the trust and fall back to 2FA.
            await prisma.trustedDevice.update({ where: { id: trustedDevice.id }, data: { revokedAt: new Date() } });
          } else {
            // Trusted device confirmed: bypass 2FA and create a full session directly.
            await prisma.trustedDevice.update({
              where: { id: trustedDevice.id },
              data: { lastUsedAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DURATION_MS) },
            });
            const isKnownDevice = await this.isKnownDeviceLocation(user.id, deviceInfo);
            const session = await this.createSession(user.id, deviceInfo, rememberMe);
            const token = signToken({ userId: user.id, email: user.email, username: user.username, scope: 'full', sessionId: session.id });
            if (!isKnownDevice) this.notifySecurityEvent(user.id, 'newDevice', deviceInfo);
            return { user: publicUser, token, rememberMe, viaTrustedDevice: true };
          }
        }
      }

      const token = signToken({ userId: user.id, email: user.email, username: user.username, scope: '2fa_pending', rememberMe });
      return { user: publicUser, token, rememberMe, requires2fa: true };
    }

    const isKnownDevice = await this.isKnownDeviceLocation(user.id, deviceInfo);
    const session = await this.createSession(user.id, deviceInfo, rememberMe);
    const token = signToken({ userId: user.id, email: user.email, username: user.username, scope: 'full', sessionId: session.id });
    if (!isKnownDevice) this.notifySecurityEvent(user.id, 'newDevice', deviceInfo);
    return { user: publicUser, token, rememberMe };
  }

  /**
   * Return current user's public profile.
   */
  async me(userId: string): Promise<PublicUser | null> {
    const user = await prisma.user.findFirst({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        appName: true,
        appSlogan: true,
        theme: true,
        language: true,
        tempUnit: true,
        accentColor: true,
        dateFormat: true,
        isAdmin: true,
        createdAt: true,
        deletionRequestedAt: true,
        pinHash: true,
        autoLockDelayMin: true,
        onboardingCompletedAt: true,
      },
    });
    return user ? this.toPublicUser(user) : null;
  }

  /**
   * Update user profile (UI-facing infos)
   */
  async updateProfile(userId: string, data: UpdateProfileInput): Promise<PublicUser> {
    if (data.username) {
      const existing = await prisma.user.findFirst({
        where: { username: data.username, NOT: { id: userId } },
        select: { id: true },
      });
      if (existing) throw new Error('USERNAME_ALREADY_TAKEN');
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        appName: true,
        appSlogan: true,
        theme: true,
        language: true,
        tempUnit: true,
        accentColor: true,
        dateFormat: true,
        isAdmin: true,
        createdAt: true,
        deletionRequestedAt: true,
        pinHash: true,
        autoLockDelayMin: true,
        onboardingCompletedAt: true,
      },
    });
    return this.toPublicUser(user);
  }

  /**
   * Delete user avatar
   */
  async deleteAvatar(userId: string): Promise<PublicUser> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarUrl: true }
    });

    if (user.avatarUrl) {
      try {
        const filename = path.basename(user.avatarUrl);
        const uploadsDir = path.resolve(process.cwd(), 'uploads', 'avatars');
        const filePath = path.resolve(uploadsDir, filename);
        if (!filePath.startsWith(uploadsDir + path.sep)) throw new Error('INVALID_PATH');

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.error('Failed to delete avatar file:', err);
        // We continue anyway to at least clear the DB field
      }
    }

    return this.updateProfile(userId, { avatarUrl: null });
  }

  /**
   * Update user email
   */
  async updateEmail(userId: string, email: string): Promise<PublicUser> {
    const existing = await prisma.user.findFirst({
      where: { email, NOT: { id: userId } }
    });
    if (existing) throw new Error('EMAIL_ALREADY_TAKEN');

    const user = await prisma.user.update({
      where: { id: userId },
      data: { email },
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        appName: true,
        appSlogan: true,
        theme: true,
        language: true,
        tempUnit: true,
        accentColor: true,
        dateFormat: true,
        isAdmin: true,
        createdAt: true,
        deletionRequestedAt: true,
        pinHash: true,
        autoLockDelayMin: true,
        onboardingCompletedAt: true,
      }
    });
    return this.toPublicUser(user);
  }

  /**
   * Update user password
   */
  async updatePassword(userId: string, currentPass: string, newPass: string, deviceInfo: DeviceInfo, currentSessionId: string): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const valid = await bcrypt.compare(currentPass, user.passwordHash);
    if (!valid) throw new Error('INVALID_CREDENTIALS');

    const passwordHash = await bcrypt.hash(newPass, BCRYPT_ROUNDS);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash }
    });

    this.notifySecurityEvent(userId, 'passwordChanged', deviceInfo);
    // A stolen session must not survive a password change.
    await this.revokeOtherSessions(userId, currentSessionId, deviceInfo.ip ?? 'unknown');
  }

  /**
   * Update user preferences (System settings)
   */
  async updatePreferences(userId: string, data: UpdatePreferencesInput): Promise<PublicUser> {
    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        appName: true,
        appSlogan: true,
        theme: true,
        language: true,
        tempUnit: true,
        accentColor: true,
        dateFormat: true,
        isAdmin: true,
        createdAt: true,
        deletionRequestedAt: true,
        pinHash: true,
        autoLockDelayMin: true,
        onboardingCompletedAt: true,
      },
    });
    return this.toPublicUser(user);
  }

  // ─── Quick Lock & Auto-Lock (FEAT-30) ──────────────────────────────────────
  // Client-side lock only: the Session/JWT stays valid throughout. These
  // methods never mint a new session or token — they only verify a secret.

  /**
   * Set (or replace) the user's unlock PIN. Requires the account password to
   * confirm identity, mirroring updatePassword's confirmation pattern.
   */
  async setPin(userId: string, password: string, pin: string): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new Error('INVALID_CREDENTIALS');

    const pinHash = await bcrypt.hash(pin, BCRYPT_ROUNDS);
    await prisma.user.update({ where: { id: userId }, data: { pinHash } });
  }

  /**
   * Remove the user's unlock PIN, falling back to password-only unlock.
   */
  async removePin(userId: string, password: string): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new Error('INVALID_CREDENTIALS');

    await prisma.user.update({ where: { id: userId }, data: { pinHash: null } });
  }

  /**
   * Verify the password OR PIN supplied to unlock the client-side lock screen.
   * This is a pure verification — it never issues a new Session or JWT, and
   * never touches Session.lastActiveAt (already refreshed by authMiddleware).
   */
  async verifyUnlock(userId: string, input: { password?: string; pin?: string }): Promise<boolean> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (input.password) {
      return bcrypt.compare(input.password, user.passwordHash);
    }
    if (input.pin && user.pinHash) {
      return bcrypt.compare(input.pin, user.pinHash);
    }
    return false;
  }

  async generateTwoFactorSecret(userId: string): Promise<{ qrCodeUrl: string; secret: string }> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.isTwoFactorEnabled) throw new Error('2FA_ALREADY_ENABLED');

    const secret = speakeasy.generateSecret({
      name: `Glou (${user.username})`,
      length: 20
    });

    const base32secret = secret.base32;

    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: base32secret },
    });

    // Make sure the qr code and the text secret are perfectly aligned
    const otpauthUrl = speakeasy.otpauthURL({
      secret: base32secret,
      label: `Glou (${user.username})`,
      algorithm: 'sha1',
      encoding: 'base32'
    });

    const qrCodeUrl = await qrcode.toDataURL(otpauthUrl);
    return { qrCodeUrl, secret: base32secret };
  }

  async turnOnTwoFactorAuthentication(userId: string, code: string, deviceInfo: DeviceInfo): Promise<{ backupCodes: string[] }> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.isTwoFactorEnabled) throw new Error('2FA_ALREADY_ENABLED');
    if (!user.twoFactorSecret) throw new Error('2FA_SECRET_NOT_GENERATED');

    const isCodeValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 1 // Allow 30 seconds drift before and after
    });

    if (!isCodeValid) throw new Error('INVALID_TOTP_CODE');

    // Generate 10 backup codes
    const backupCodes = Array.from({ length: 10 }).map(() => crypto.randomBytes(4).toString('hex'));
    const hashedBackupCodes = await Promise.all(backupCodes.map(bc => bcrypt.hash(bc, BCRYPT_ROUNDS)));

    await prisma.user.update({
      where: { id: userId },
      data: {
        isTwoFactorEnabled: true,
        backupCodes: hashedBackupCodes,
      },
    });

    this.notifySecurityEvent(userId, 'twoFactorEnabled', deviceInfo);

    return { backupCodes }; // Return plain codes ONCE
  }

  async turnOffTwoFactorAuthentication(userId: string, password: string, deviceInfo: DeviceInfo, currentSessionId: string, code?: string): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.isTwoFactorEnabled) throw new Error('2FA_NOT_ENABLED');

    const validPwd = await bcrypt.compare(password, user.passwordHash);
    if (!validPwd) throw new Error('INVALID_CREDENTIALS');

    // Verify code: either TOTP or a matching backup code
    let validCode = false;

    if (code && code.length === 6 && user.twoFactorSecret) {
      validCode = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: code,
        window: 1
      });
    } else if (code && code.length === 8 && user.backupCodes.length > 0) {
      // Check backup codes
      for (const hashedCode of user.backupCodes) {
        if (await bcrypt.compare(code, hashedCode)) {
          validCode = true;
          // Could remove used code, but turning off drops them anyway
          break;
        }
      }
    }

    if (!validCode) throw new Error('INVALID_TOTP_CODE');

    await prisma.user.update({
      where: { id: userId },
      data: {
        isTwoFactorEnabled: false,
        twoFactorSecret: null,
        backupCodes: [],
      },
    });

    this.notifySecurityEvent(userId, 'twoFactorDisabled', deviceInfo);
    // A stolen session must not survive 2FA being turned off (it weakens the
    // account's remaining auth factor, same rationale as a password change).
    await this.revokeOtherSessions(userId, currentSessionId, deviceInfo.ip ?? 'unknown');
  }

  // ─── RGPD Methods (FEAT-38 / FEAT-18) ────────────────────────────────────────

  /**
   * FEAT-18: category-filtered export. `categories` is optional and defaults
   * to "everything" — rétrocompatible with the pre-FEAT-18 full JSON export
   * (FEAT-38). An unknown/typo'd category is silently ignored rather than
   * rejected, since this filters an already-authorized personal export
   * rather than validating a write.
   */
  async exportUserData(userId: string, categories?: ExportCategory[]): Promise<Record<string, unknown>> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        inventory: { where: { deletedAt: null } },
        cellars: true,
        collections: { include: { items: { select: { id: true, name: true } } } },
        tastingNotes: true,
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 500 },
      },
    });

    const selected = categories && categories.length > 0
      ? categories.filter((c): c is ExportCategory => ALL_EXPORT_CATEGORIES.includes(c))
      : ALL_EXPORT_CATEGORIES;
    const includes = (cat: ExportCategory) => selected.includes(cat);

    const result: Record<string, unknown> = {
      profile: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
        language: user.language,
        theme: user.theme,
      },
    };

    if (includes('inventory')) result.inventory = user.inventory;
    if (includes('cellars')) result.cellars = user.cellars;
    if (includes('collections')) result.collections = user.collections;
    if (includes('tastings')) result.tastingNotes = user.tastingNotes;
    if (includes('activity')) {
      result.activityLog = user.auditLogs.map(l => ({
        action: l.action,
        status: l.status,
        createdAt: l.createdAt,
        ip: l.ip,
      }));
    }

    result.exportedAt = new Date().toISOString();
    return result;
  }

  async requestAccountDeletion(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { deletionRequestedAt: new Date() },
    });
  }

  async cancelAccountDeletion(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { deletionRequestedAt: null },
    });
  }

  // ─── Onboarding (FEAT-56) ───────────────────────────────────────────────────

  /**
   * Mark the setup wizard as done — either because the user finished it or
   * because they explicitly skipped it. Both cases stamp the same field:
   * from a "show it again automatically?" standpoint they're equivalent.
   * The wizard remains reachable afterwards from the profile page, which
   * re-opens it on demand without touching this timestamp.
   */
  async completeOnboarding(userId: string): Promise<PublicUser> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { onboardingCompletedAt: new Date() },
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        appName: true,
        appSlogan: true,
        theme: true,
        language: true,
        tempUnit: true,
        accentColor: true,
        dateFormat: true,
        isAdmin: true,
        createdAt: true,
        deletionRequestedAt: true,
        pinHash: true,
        autoLockDelayMin: true,
        onboardingCompletedAt: true,
      },
    });
    return this.toPublicUser(user);
  }

  // ─── 2FA Methods ────────────────────────────────────────────────────────────

  async verifyTwoFactorLogin(
    userId: string,
    code: string,
    rememberMe: boolean,
    deviceInfo: DeviceInfo,
    trustDevice = false,
  ): Promise<{ user: PublicUser; token: string; rememberMe: boolean; trustedDeviceToken?: string }> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.isTwoFactorEnabled) throw new Error('2FA_NOT_ENABLED');

    let validCode = false;
    let usedBackupCodeHash: string | null = null;

    if (code.length === 6 && user.twoFactorSecret) {
      validCode = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: code,
        window: 1
      });
    } else if (code.length === 8 && user.backupCodes.length > 0) {
      for (const hashedCode of user.backupCodes) {
        if (await bcrypt.compare(code, hashedCode)) {
          validCode = true;
          usedBackupCodeHash = hashedCode;
          break;
        }
      }
    }

    if (!validCode) throw new Error('INVALID_TOTP_CODE');

    // If backup code used, remove it
    if (usedBackupCodeHash) {
      const remainingCodes = user.backupCodes.filter(c => c !== usedBackupCodeHash);
      await prisma.user.update({
        where: { id: user.id },
        data: { backupCodes: remainingCodes }
      });
    }

    const publicUser: PublicUser = this.toPublicUser(user);

    const isKnownDevice = await this.isKnownDeviceLocation(user.id, deviceInfo);
    const session = await this.createSession(user.id, deviceInfo, rememberMe);
    const token = signToken({ userId: user.id, email: user.email, username: user.username, scope: 'full', sessionId: session.id });
    if (!isKnownDevice) this.notifySecurityEvent(user.id, 'newDevice', deviceInfo);

    let trustedDeviceToken: string | undefined;
    if (trustDevice) {
      trustedDeviceToken = await this.createTrustedDevice(user.id, deviceInfo);
    }

    return { user: publicUser, token, rememberMe, trustedDeviceToken };
  }

  // ─── Sessions & Trusted Devices (FEAT-25) ──────────────────────────────────

  /**
   * List the user's active (non-revoked, non-expired) sessions, most recently
   * active first, with a human-readable device label and approximate location.
   */
  async listSessions(userId: string, currentSessionId: string): Promise<SessionSummary[]> {
    const sessions = await prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastActiveAt: 'desc' },
    });

    return sessions.map((s) => ({
      id: s.id,
      device: describeDevice(s.userAgent),
      location: locateIp(s.ip),
      createdAt: s.createdAt,
      lastActiveAt: s.lastActiveAt,
      rememberMe: s.rememberMe,
      isCurrent: s.id === currentSessionId,
    }));
  }

  /**
   * Revoke a session belonging to `userId`, forcing an immediate remote logout.
   */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) throw new Error('NOT_FOUND');

    await prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    // FEAT-29: notify the account owner a session was closed, using the
    // closed session's own device/IP as "device concerné" (we don't track
    // who issued the revocation, hence no "closed by" detail here).
    this.notifySecurityEvent(userId, 'sessionRevoked', { userAgent: session.userAgent, ip: session.ip });
  }

  /**
   * Mark the caller's current device as trusted outside of the 2FA login
   * flow (e.g. a "Trust this device" button in security settings).
   */
  async trustCurrentDevice(userId: string, deviceInfo: DeviceInfo): Promise<{ token: string }> {
    const token = await this.createTrustedDevice(userId, deviceInfo);
    return { token };
  }

  /**
   * Revoke the TrustedDevice matching the given raw token, if it belongs to `userId`.
   */
  async untrustCurrentDevice(userId: string, trustedDeviceToken: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(trustedDeviceToken).digest('hex');
    const device = await prisma.trustedDevice.findUnique({ where: { tokenHash } });
    if (!device || device.userId !== userId) throw new Error('NOT_FOUND');

    await prisma.trustedDevice.update({
      where: { id: device.id },
      data: { revokedAt: new Date() },
    });
  }
}

export const authService = new AuthService();

// Cookie settings helper
export const COOKIE_NAME = 'glou_token';

// Persistent cookie (rememberMe=true) — 30 days
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/',
};

// Session cookie (rememberMe=false) — expires when browser closes
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
};
