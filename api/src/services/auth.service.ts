import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import qrcode from 'qrcode';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { prisma, PrismaClientOrTx } from '../lib/prisma';
import { RegisterInput, LoginInput } from '../schemas/auth.schema';
import { UpdateProfileInput, UpdatePreferencesInput, UPLOADED_AVATAR_PATH } from '../schemas/user.schema';
import { Prisma, Theme, Language, TempUnit, DateFormat } from '@prisma/client';
import { describeDevice, locateIp, countryOfIp, type DeviceDescription } from '../lib/device';
import { notificationService } from './notification.service';
import { systemConfigService } from './system-config.service';
import { auditLog, type AuditAction } from './audit.service';
import { UNIT_SLOTS_INCLUDE } from '../lib/product-fields';
import { isCookieSecure } from '../lib/cookie-secure';
import { escapeHtml } from '../lib/html';
import { isNotifEn } from '../lib/notif-lang';
import { encrypt } from '../lib/crypto';
import { openTwoFactorSecret } from '../lib/two-factor-secret';
import { newTotpSecret, totpUri, isCurrentTotp } from '../lib/totp';
import { ACCOUNT_DELETION_GRACE_DAYS, EXPORT_CATEGORIES, type ExportCategory, type PublicUser } from '../../../shared/auth';
import { deletePersonalData } from './account-deletion.service';
import { countOtherAdmins, countOtherAdminsLocked } from '../lib/last-admin';
import { RELEASE_NOTES, seenStateNow } from '../lib/release-notes';
import { APP_VERSION } from '../lib/app-version';

const JWT_EXPIRES_IN = '30d';
// Session / trusted-device lifetime, kept in sync with JWT_EXPIRES_IN (30d) for consistency
// (FEAT-25: a Session must not outlive the JWT that references it).
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;
// #607: a refused sign-in costs one bcrypt comparison whether or not the
// account exists, so the response time does not tell who has one. Unknown
// identifiers are compared against this hash of a random value nobody knows,
// made once at startup with the same cost as real password hashes.
const UNKNOWN_ACCOUNT_HASH: Promise<string> = bcrypt.hash(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS);
// Hex-encoded length of a generated backup code (crypto.randomBytes(10) -> 20 hex chars).
// A TOTP code is always 6 digits, so checking this length is enough to tell the two apart.
const BACKUP_CODE_LENGTH = 20;

// ISSUE_043: the `2fa_pending` token only proves the first factor was passed.
// It must not inherit the 30-day session lifetime — a stolen/leaked password
// would otherwise hand an attacker a month-long window to brute-force the
// 6-digit code. Ten minutes is enough to read a code from an authenticator
// app or fetch a backup code.
const TWO_FACTOR_PENDING_EXPIRES_IN = '10m';
// Consecutive failed 2FA codes tolerated per account before the challenge is
// temporarily locked. Complements the per-IP rate limiter in app.ts, which an
// attacker can sidestep by rotating addresses.
const TWO_FACTOR_MAX_FAILED_ATTEMPTS = 5;
const TWO_FACTOR_LOCK_DURATION_MS = 15 * 60 * 1000;

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

// FEAT-18: categories selectable for a filtered personal data export (list in
// shared/auth.ts, #466).
// #224: wishlist / budget / goals / counts / humidor / sessions / devices /
// notifications / configHistory were missing, so the "full" export was not.
// Sessions and trusted devices are exported as descriptive metadata only
// (device label, location, timestamps) — never the tokenHash/bearer token
// that authenticates them, which would let the export itself be replayed as
// a credential.
export const ALL_EXPORT_CATEGORIES: readonly ExportCategory[] = EXPORT_CATEGORIES;

export type LoginResult =
  | { user: PublicUser; token: string; rememberMe: boolean; requires2fa?: never; viaTrustedDevice?: boolean; knownBrowserToken?: string }
  | { user: PublicUser; token: string; rememberMe: boolean; requires2fa: true };

export interface SessionSummary {
  id: string;
  device: DeviceDescription;
  location: { city: string | null; country: string | null } | null;
  createdAt: Date;
  lastActiveAt: Date;
  rememberMe: boolean;
  isCurrent: boolean;
}

/**
 * Shape shared by every Prisma User read used to build a PublicUser (FEAT-30 added pinHash/autoLockDelayMin).
 * PublicUser itself is the contract in shared/auth.ts (#466).
 */
interface RawUserForPublic {
  id: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  appName: string | null;
  appSlogan: string | null;
  displayName: string | null;
  theme: Theme;
  language: Language;
  tempUnit: TempUnit;
  accentColor: string;
  dateFormat: DateFormat;
  expertMode: boolean;
  isAdmin: boolean;
  createdAt: Date;
  deletionRequestedAt: Date | null;
  pinHash: string | null;
  autoLockDelayMin: number | null;
  onboardingCompletedAt: Date | null;
  mustChangePassword: boolean;
  isTwoFactorEnabled: boolean;
}

/**
 * Columns read to build a PublicUser — every key of RawUserForPublic, nothing
 * else. `satisfies` makes a missing or extra key a compile error, so the
 * select can no longer drift from the interface (#576).
 */
const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  email: true,
  avatarUrl: true,
  appName: true,
  appSlogan: true,
  displayName: true,
  theme: true,
  language: true,
  tempUnit: true,
  accentColor: true,
  dateFormat: true,
  expertMode: true,
  isAdmin: true,
  createdAt: true,
  deletionRequestedAt: true,
  pinHash: true,
  autoLockDelayMin: true,
  onboardingCompletedAt: true,
  mustChangePassword: true,
  isTwoFactorEnabled: true,
} satisfies Record<keyof RawUserForPublic, true>;

// ─── Known browser (#988) ────────────────────────────────────────────────────
// A browser where the account completed a sign-in. Stateless: a JWT naming a
// random browser id, the account, and a fingerprint of the account's current
// password hash. Every way of changing a password (self-service, e-mail reset
// link, admin reset) writes a new hash, so every cookie issued before it stops
// verifying, with no table to keep and nothing to forget to revoke. Its claim
// names (`kb*`) differ from a session token's (`userId`) and a trusted
// device's (`tdt`), so none can stand for another.
export const KNOWN_BROWSER_TTL_MS = SESSION_DURATION_MS;

/** HMAC of the password hash: reveals nothing about it, changes with it. */
function passwordFingerprint(passwordHash: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`known-browser:${passwordHash}`).digest('base64url');
}

function knownBrowserToken(user: { id: string; passwordHash: string }): string | undefined {
  const secret = process.env.JWT_SECRET;
  if (!secret) return undefined;
  return jwt.sign(
    { kb: crypto.randomBytes(16).toString('base64url'), kbu: user.id, kbp: passwordFingerprint(user.passwordHash, secret) },
    secret,
    { algorithm: 'HS256', expiresIn: Math.floor(KNOWN_BROWSER_TTL_MS / 1000) },
  );
}

function signToken(payload: AuthPayload, expiresIn: SignOptions['expiresIn'] = JWT_EXPIRES_IN): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET_NOT_SET');
  return jwt.sign(payload, secret, { expiresIn });
}

// ─── Security Notifications (FEAT-29) ────────────────────────────────────────

export type SecurityEventKey =
  | 'newDevice'
  | 'passwordChanged'
  | 'twoFactorEnabled'
  | 'twoFactorDisabled'
  | 'sessionRevoked'
  | 'otherSessionsRevoked'
  | 'emailChanged'
  | 'usernameChanged'
  | 'twoFactorLocked'
  | 'backupCodesRegenerated'
  | 'accountDeletionRequested';

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
  // #773 — "sign out all other sessions": the device below is the one that asked.
  otherSessionsRevoked: (isEn) => isEn
    ? { subject: 'Glou — Other sessions signed out', intro: 'All your other sessions were signed out from the device below, which stays signed in. Other devices you had trusted will ask for the two-factor code again.' }
    : { subject: 'Glou — Autres sessions déconnectées', intro: 'Toutes vos autres sessions ont été déconnectées depuis l’appareil ci-dessous, qui reste connecté. Les autres appareils de confiance redemanderont le code de double authentification.' },
  // ISSUE_042 — sent to the PREVIOUS address, which is the only one the
  // legitimate owner still controls once the change went through.
  emailChanged: (isEn) => isEn
    ? { subject: 'Glou — Your account email was changed', intro: 'The email address of your account was just changed. This message was sent to the previous address.' }
    : { subject: 'Glou — Adresse e-mail modifiée', intro: 'L’adresse e-mail de votre compte vient d’être modifiée. Ce message est envoyé à l’ancienne adresse.' },
  // #911 (review) — the username is a sign-in identifier too.
  usernameChanged: (isEn) => isEn
    ? { subject: 'Glou — Your username was changed', intro: 'The username you sign in with was just changed. Sign in with the new one from now on.' }
    : { subject: 'Glou — Nom d’utilisateur modifié', intro: 'Le nom d’utilisateur qui vous sert à vous connecter vient d’être modifié. Connectez-vous désormais avec le nouveau.' },
  // ISSUE_043 — repeated wrong 2FA codes on an account.
  twoFactorLocked: (isEn) => isEn
    ? { subject: 'Glou — Two-factor verification temporarily locked', intro: 'Too many incorrect two-factor codes were submitted on your account, so the verification step has been temporarily locked.' }
    : { subject: 'Glou — Vérification en deux étapes temporairement bloquée', intro: 'Trop de codes de double authentification incorrects ont été saisis sur votre compte : l’étape de vérification est temporairement bloquée.' },
  // #638 — the whole set of backup codes was replaced; the old ones no longer work.
  backupCodesRegenerated: (isEn) => isEn
    ? { subject: 'Glou — New backup codes generated', intro: 'New two-factor backup codes were just generated for your account. The previous ones no longer work.' }
    : { subject: 'Glou — Nouveaux codes de secours générés', intro: 'De nouveaux codes de secours de double authentification viennent d’être générés pour votre compte. Les précédents ne fonctionnent plus.' },
  // #603 — the request used to show up only in the profile's GDPR section.
  accountDeletionRequested: (isEn) => isEn
    ? { subject: 'Glou — Account deletion requested', intro: `The deletion of your account was just requested. It will be anonymised in ${ACCOUNT_DELETION_GRACE_DAYS} days unless the request is cancelled from your profile before then.` }
    : { subject: 'Glou — Demande de suppression du compte', intro: `La suppression de votre compte vient d’être demandée. Il sera anonymisé dans ${ACCOUNT_DELETION_GRACE_DAYS} jours, sauf si la demande est annulée depuis votre profil d’ici là.` },
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
      displayName: user.displayName,
      theme: user.theme,
      language: user.language,
      tempUnit: user.tempUnit,
      accentColor: user.accentColor,
      dateFormat: user.dateFormat,
      expertMode: user.expertMode,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
      deletionRequestedAt: user.deletionRequestedAt,
      hasPin: !!user.pinHash,
      autoLockDelayMin: user.autoLockDelayMin,
      onboardingCompletedAt: user.onboardingCompletedAt,
      mustChangePassword: user.mustChangePassword,
      isTwoFactorEnabled: user.isTwoFactorEnabled,
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
   * single `SESSION_REVOKE` AuditLog entry covering the whole batch, and
   * returns how many sessions were signed out.
   */
  private async revokeOtherSessions(userId: string, currentSessionId: string, ip: string, reason = 'bulk_revoke_on_credential_change'): Promise<number> {
    const sessions = await prisma.session.findMany({
      where: { userId, revokedAt: null, NOT: { id: currentSessionId } },
      select: { id: true },
    });
    if (sessions.length === 0) return 0;

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
        reason,
        revokedSessionIds: sessions.map((s) => s.id),
        excludedSessionId: currentSessionId,
      },
    });
    return sessions.length;
  }

  /**
   * Revoke every TrustedDevice of `userId` (ISSUE_044). A trusted device
   * skips the 2FA challenge for 30 days, so it is a credential in its own
   * right: it must not survive a password change, a password reset or a 2FA
   * disable. Returns the number of devices actually revoked.
   */
  private async revokeAllTrustedDevices(userId: string): Promise<number> {
    const result = await prisma.trustedDevice.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  /**
   * Fire-and-forget a security notification (FEAT-29). Never throws and never
   * blocks its caller — mirrors the rest of the audit/notification pipeline.
   * Always bypasses quiet hours: a compromised account must not wait for morning.
   */
  private notifySecurityEvent(userId: string, eventKey: SecurityEventKey, deviceInfo: DeviceInfo, emailOverride?: string): void {
    void this.sendSecurityNotification(userId, eventKey, deviceInfo, emailOverride).catch((err) => {
      console.error(`[auth] Failed to send security notification (${eventKey}):`, err);
    });
  }

  /**
   * Public entry point for security notifications raised by sibling services
   * that share this account-security pipeline (ISSUE_044: the password-reset
   * flow). Same fire-and-forget contract as the internal callers.
   */
  notifyAccountSecurityEvent(userId: string, eventKey: SecurityEventKey, deviceInfo: DeviceInfo): void {
    this.notifySecurityEvent(userId, eventKey, deviceInfo);
  }

  private async sendSecurityNotification(userId: string, eventKey: SecurityEventKey, deviceInfo: DeviceInfo, emailOverride?: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { language: true, notifLanguage: true } });
    if (!user) return;
    const isEn = (user.notifLanguage ?? user.language) === 'EN';

    const appUrl = await systemConfigService.getEffectivePublicUrl();
    const securityUrl = `${appUrl}/profile#security`;
    const timestamp = new Date().toLocaleString(isEn ? 'en-US' : 'fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
    const { browser, os } = describeDevice(deviceInfo.userAgent);
    const device = browser || os
      ? `${browser ?? (isEn ? 'Unknown browser' : 'Navigateur inconnu')} ${isEn ? 'on' : 'sur'} ${os ?? (isEn ? 'Unknown OS' : 'OS inconnu')}`
      : (isEn ? 'Unknown device' : 'Appareil inconnu');
    const location = locateIp(deviceInfo.ip);
    const locationLabel = location?.city && location?.country
      ? `${location.city}, ${location.country}`
      : location?.country ?? (isEn ? 'Unknown location' : 'Localisation inconnue');

    const { subject, intro } = SECURITY_EVENT_CONTENT[eventKey](isEn);

    const htmlBody = [
      `<p>${intro}</p>`,
      '<ul>',
      `<li>Date: ${timestamp}</li>`,
      `<li>${isEn ? 'Device' : 'Appareil'}: ${escapeHtml(device)}</li>`,
      `<li>${isEn ? 'Location' : 'Localisation'}: ${escapeHtml(locationLabel)}</li>`,
      '</ul>',
      `<p><a href="${securityUrl}">${isEn ? 'Review your security settings' : 'Consulter mes paramètres de sécurité'}</a></p>`,
      `<p style="color:#666;font-size:12px;">${isEn
        ? 'If this was not you, secure your account immediately: change your password and sign out other sessions.'
        : "Si vous n'êtes pas à l'origine de cette action, sécurisez votre compte immédiatement : changez votre mot de passe et déconnectez les autres sessions."}</p>`,
      // #434: DB-IP Lite licence requires a link back wherever its results are shown.
      location
        ? `<p style="color:#666;font-size:12px;"><a href="https://db-ip.com">${isEn ? 'IP Geolocation by DB-IP' : 'Géolocalisation IP par DB-IP'}</a></p>`
        : '',
    ].join('');

    await notificationService.send({ userId, category: 'security', subject, htmlBody, bypassQuietHours: true, emailOverride });
  }

  /**
   * Register a new user.
   */
  async register(data: RegisterInput, deviceInfo: DeviceInfo): Promise<{ user: PublicUser; token: string; knownBrowserToken?: string }> {
    const { username, email, password, displayName } = data;

    // If this is the first user, make them an admin
    const userCount = await prisma.user.count();
    const isAdmin = userCount === 0;

    // ISSUE_001/#73: the first account always gets through (there is no
    // admin yet to open registrations), every one after it needs the
    // instance to have been opened up explicitly.
    if (!isAdmin && !(await systemConfigService.isRegistrationOpen())) {
      throw new Error('REGISTRATION_CLOSED');
    }

    // Check uniqueness
    const existing = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
      select: { id: true },
    });
    // ISSUE_015: login was deliberately built not to reveal whether an
    // account exists ("Always 401 for invalid credentials (no
    // enumeration)") — naming which field conflicted here undid that for an
    // anonymous caller, who could probe any address and learn whether it
    // already has an account. A single generic code names neither.
    if (existing) throw new Error('REGISTRATION_CONFLICT');

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const rawUser = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        isAdmin,
        // FEAT-115 (#990): a new install starts with its version seen; the
        // What's New? window first opens at the next update.
        ...(isAdmin ? seenStateNow(RELEASE_NOTES, APP_VERSION) : {}),
        displayName: displayName || null,
        ...(data.language ? { language: data.language } : {}),
      },
      select: PUBLIC_USER_SELECT,
    }).catch((err: unknown) => {
      // Two sign-ups with the same username or e-mail at once both pass the
      // check above; the unique index refuses the second (#467 review).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new Error('REGISTRATION_CONFLICT');
      }
      throw err;
    });
    const user = this.toPublicUser(rawUser);

    // Registration creates a session directly (scope 'full', no 2FA prompt at signup);
    // its cookie is persistent (COOKIE_OPTIONS), so the Session is flagged rememberMe=true.
    const session = await this.createSession(user.id, deviceInfo, true);
    const token = signToken({ userId: user.id, email: user.email, username: user.username, scope: 'full', sessionId: session.id });
    // #988: a sign-in like any other, so this browser is known from now on.
    return { user, token, knownBrowserToken: knownBrowserToken({ id: user.id, passwordHash }) };
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

    // #601: a refusal on an existing account is audited under that account;
    // an unknown identifier is not (no account to file it under, and what
    // was typed, maybe a password, is never kept).
    // #607: compared in every case, before any refusal, so an unknown or
    // deactivated account takes as long to refuse as a wrong password.
    const valid = await bcrypt.compare(password, user ? user.passwordHash : await UNKNOWN_ACCOUNT_HASH);
    if (!user) throw new Error('INVALID_CREDENTIALS');
    if (!user.isActive) {
      this.auditLoginFailure(user.id, deviceInfo, 'account_deactivated');
      throw new Error('ACCOUNT_DEACTIVATED');
    }
    if (!valid) {
      this.auditLoginFailure(user.id, deviceInfo, 'wrong_password');
      throw new Error('INVALID_CREDENTIALS');
    }

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
            return { user: publicUser, token, rememberMe, viaTrustedDevice: true, knownBrowserToken: knownBrowserToken(user) };
          }
        }
      }

      const token = signToken(
        { userId: user.id, email: user.email, username: user.username, scope: '2fa_pending', rememberMe },
        TWO_FACTOR_PENDING_EXPIRES_IN,
      );
      return { user: publicUser, token, rememberMe, requires2fa: true };
    }

    const isKnownDevice = await this.isKnownDeviceLocation(user.id, deviceInfo);
    const session = await this.createSession(user.id, deviceInfo, rememberMe);
    const token = signToken({ userId: user.id, email: user.email, username: user.username, scope: 'full', sessionId: session.id });
    if (!isKnownDevice) this.notifySecurityEvent(user.id, 'newDevice', deviceInfo);
    return { user: publicUser, token, rememberMe, knownBrowserToken: knownBrowserToken(user) };
  }

  /**
   * #980: the trusted device a sign-in comes from, when its cookie may skip
   * the identifier's sign-in budget: the device belongs to the account the
   * identifier names (compared exactly as {@link login} does), is neither
   * revoked nor expired, the account is active, and the connection's country
   * matches the device's (the same rule that lets the device skip the 2FA
   * challenge). The account is reached through the device, never looked up by
   * the identifier, so the answer tells nothing about other identifiers.
   */
  async signInTrustedDeviceId(identifier: string, trustedDeviceToken: string, ip: string): Promise<string | null> {
    const tokenHash = crypto.createHash('sha256').update(trustedDeviceToken).digest('hex');
    const device = await prisma.trustedDevice.findUnique({
      where: { tokenHash },
      select: { id: true, revokedAt: true, expiresAt: true, country: true, user: { select: { username: true, email: true, isActive: true } } },
    });
    if (!device || device.revokedAt || device.expiresAt <= new Date() || !device.user.isActive) return null;
    if (identifier !== device.user.username && identifier !== device.user.email) return null;
    const currentCountry = countryOfIp(ip);
    if (device.country && currentCountry && device.country !== currentCountry) return null;
    return device.id;
  }

  /**
   * #988: the id of the known browser a sign-in comes from, when its cookie
   * may skip the identifier's sign-in budget: the cookie verifies, names an
   * active account the identifier names (username or e-mail, compared exactly
   * as {@link login} does), and was issued under the account's current
   * password. Like {@link signInTrustedDeviceId}, the account is reached
   * through the cookie, never looked up by the identifier. It never touches
   * 2FA: {@link login} does not read it.
   */
  async signInKnownBrowserId(identifier: string, cookie: string): Promise<string | null> {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    let claims: { kb?: unknown; kbu?: unknown; kbp?: unknown };
    try {
      const payload: unknown = jwt.verify(cookie, secret, { algorithms: ['HS256'] });
      if (typeof payload !== 'object' || payload === null) return null;
      claims = payload as typeof claims;
    } catch {
      return null;
    }
    const { kb, kbu, kbp } = claims;
    if (typeof kb !== 'string' || !kb || typeof kbu !== 'string' || typeof kbp !== 'string') return null;
    const user = await prisma.user.findUnique({
      where: { id: kbu },
      select: { username: true, email: true, isActive: true, passwordHash: true },
    });
    if (!user || !user.isActive) return null;
    if (identifier !== user.username && identifier !== user.email) return null;
    const expected = Buffer.from(passwordFingerprint(user.passwordHash, secret));
    const given = Buffer.from(kbp);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
    return kb;
  }

  /**
   * #980: the identifier's sign-in budget is spent and a sign-in was refused.
   * Filed under the account it names, if any (an unknown identifier is not
   * recorded, like a wrong password on it, #601), with the reason only: what
   * was typed is never kept. The rate limiter calls this once per window.
   * Never throws.
   */
  async auditSignInLocked(identifier: string, ip: string): Promise<void> {
    try {
      const user = await prisma.user.findFirst({ where: { OR: [{ username: identifier }, { email: identifier }] }, select: { id: true } });
      if (user) await auditLog({ userId: user.id, action: 'LOGIN_FAILED', status: 'error', ip, details: { reason: 'sign_in_locked' } });
    } catch (err) {
      console.error('[audit] Failed to record a locked sign-in:', err);
    }
  }

  /** #601: a refused sign-in, with the reason only. */
  private auditLoginFailure(userId: string, deviceInfo: DeviceInfo, reason: 'account_deactivated' | 'wrong_password' | 'wrong_2fa_code'): void {
    void auditLog({ userId, action: 'LOGIN_FAILED', status: 'error', ip: deviceInfo.ip ?? 'unknown', details: { reason } });
  }

  /** #601: a successful change of the account's own credentials. */
  private auditSecurityChange(userId: string, action: AuditAction, deviceInfo: DeviceInfo, details?: Record<string, unknown>): void {
    void auditLog({ userId, action, status: 'success', ip: deviceInfo.ip ?? 'unknown', ...(details ? { details } : {}) });
  }

  /**
   * Return current user's public profile.
   */
  async me(userId: string): Promise<PublicUser | null> {
    const user = await prisma.user.findFirst({
      where: { id: userId },
      select: PUBLIC_USER_SELECT,
    });
    return user ? this.toPublicUser(user) : null;
  }

  /**
   * Update user profile (UI-facing infos). `avatarUrl` comes only from the
   * avatar routes, never from the request body (#880).
   */
  async updateProfile(userId: string, data: UpdateProfileInput & { avatarUrl?: string | null }): Promise<PublicUser> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...data,
        displayName: data.displayName === undefined ? undefined : data.displayName?.trim() || null,
      },
      select: PUBLIC_USER_SELECT,
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

    if (user.avatarUrl) await this.deleteAvatarFile(user.avatarUrl, [userId]);

    return this.updateProfile(userId, { avatarUrl: null });
  }

  /**
   * #911: re-confirms the account password before an action that changes a
   * sign-in identifier or opens the cellar beyond the session (a read/write
   * guest link). An open session alone is not enough. Throws REAUTH_REQUIRED
   * (no password sent) or INVALID_CREDENTIALS (wrong password), like the
   * e-mail change.
   */
  async confirmPassword(userId: string, password: string | undefined): Promise<void> {
    if (!password) throw new Error('REAUTH_REQUIRED');
    const { passwordHash } = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
    if (!(await bcrypt.compare(password, passwordHash))) throw new Error('INVALID_CREDENTIALS');
  }

  /**
   * #769, #911: the username is also a sign-in identifier, so changing it
   * asks for the password and is audited with both names.
   */
  async updateUsername(userId: string, username: string, currentPassword: string | undefined, deviceInfo: DeviceInfo): Promise<PublicUser> {
    await this.confirmPassword(userId, currentPassword);

    const existing = await prisma.user.findFirst({
      where: { username, NOT: { id: userId } },
      select: { id: true },
    });
    if (existing) throw new Error('USERNAME_ALREADY_TAKEN');

    const { username: previousUsername } = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true } });
    let user;
    try {
      user = await prisma.user.update({ where: { id: userId }, data: { username }, select: PUBLIC_USER_SELECT });
    } catch (err) {
      // Taken by someone else between the check above and this write.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new Error('USERNAME_ALREADY_TAKEN');
      throw err;
    }

    if (previousUsername !== user.username) {
      this.notifySecurityEvent(userId, 'usernameChanged', deviceInfo);
      this.auditSecurityChange(userId, 'USERNAME_CHANGE', deviceInfo, { previousUsername, newUsername: user.username });
    }
    return this.toPublicUser(user);
  }

  /**
   * Update user email.
   *
   * ISSUE_042: changing the account's email reroutes the whole password-reset
   * channel, so it is treated like every other sensitive account change —
   * the current password is required (same pattern as `updatePassword`,
   * `setPin` and `turnOffTwoFactorAuthentication`) — and a security
   * notification is sent to the PREVIOUS address, the only one the
   * legitimate owner still controls afterwards.
   */
  async updateEmail(userId: string, email: string, currentPassword: string, deviceInfo: DeviceInfo): Promise<PublicUser> {
    const account = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true, email: true },
    });

    const valid = await bcrypt.compare(currentPassword, account.passwordHash);
    if (!valid) throw new Error('INVALID_CREDENTIALS');

    const existing = await prisma.user.findFirst({
      where: { email, NOT: { id: userId } }
    });
    if (existing) throw new Error('EMAIL_ALREADY_TAKEN');

    const previousEmail = account.email;

    const user = await prisma.user.update({
      where: { id: userId },
      data: { email },
      select: PUBLIC_USER_SELECT
    });

    if (previousEmail !== user.email) {
      this.notifySecurityEvent(userId, 'emailChanged', deviceInfo, previousEmail);
      // #601: both addresses, so an admin can tell where the account went.
      this.auditSecurityChange(userId, 'EMAIL_CHANGE', deviceInfo, { previousEmail, newEmail: user.email });
    }

    return this.toPublicUser(user);
  }

  /**
   * Update user password. Also the forced change after an admin reset
   * (#336). Returns a new known-browser token (#988): the new hash voids
   * every earlier one, the member's own browser included, so the route hands
   * that browser a fresh one.
   */
  async updatePassword(userId: string, currentPass: string, newPass: string, deviceInfo: DeviceInfo, currentSessionId: string): Promise<{ knownBrowserToken?: string }> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const valid = await bcrypt.compare(currentPass, user.passwordHash);
    if (!valid) throw new Error('INVALID_CREDENTIALS');

    const passwordHash = await bcrypt.hash(newPass, BCRYPT_ROUNDS);
    await prisma.user.update({
      where: { id: userId },
      // #336: a real password choice through this flow always clears the
      // admin-reset flag, whether or not it was set.
      data: { passwordHash, mustChangePassword: false }
    });

    this.notifySecurityEvent(userId, 'passwordChanged', deviceInfo);
    this.auditSecurityChange(userId, 'PASSWORD_CHANGE', deviceInfo);
    // A stolen session must not survive a password change.
    await this.revokeOtherSessions(userId, currentSessionId, deviceInfo.ip ?? 'unknown');
    // ISSUE_044: neither must a trusted device, which skips the 2FA challenge.
    await this.revokeAllTrustedDevices(userId);
    return { knownBrowserToken: knownBrowserToken({ id: userId, passwordHash }) };
  }

  /**
   * #336: lets an administrator recover a member's account without SMTP —
   * the only recourse used to be a direct database edit. Returns the
   * temporary password in the clear; the caller (admin router) must show it
   * exactly once and never persist or log it. The member is forced to pick a
   * real password on next login (`mustChangePassword`, cleared by the
   * existing `updatePassword` flow), and every existing session/trusted
   * device is revoked — the same security posture as a self-service reset
   * (password-reset.service.ts#resetPassword).
   *
   * #638: it also turns the member's 2FA off (secret, backup codes and
   * failure counter erased), so a lost phone has one recovery path: without
   * that, sign-in with the temporary password still stopped at the code step.
   * Not on the admin's own account: there an open session would be enough to
   * strip a second factor that turning 2FA off otherwise asks a code for.
   *
   * Since the temporary password goes to the admin, a reset on the session
   * alone would let a stolen admin session take over accounts. So every
   * reset asks the acting admin to re-authenticate in the same request
   * (`reauth`, see reauthenticateAdmin). A refusal leaves the target
   * untouched and is audited.
   */
  async adminResetPassword(
    userId: string,
    adminUserId: string,
    deviceInfo: DeviceInfo = {},
    reauth: { password?: string; code?: string } = {},
  ): Promise<string> {
    const target = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { isTwoFactorEnabled: true } });
    // #601: its own action in the log, not a SESSION_REVOKE among others.
    const audit = { action: 'ADMIN_PASSWORD_RESET' as const, details: { targetUserId: userId } };
    // Every reset, the admin's own included: a temporary password handed to
    // the session holder is a credential, and a known password is what the
    // step-up itself accepts (review: resetting oneself or a member without
    // 2FA, then promoting them, would otherwise pass it).
    await this.reauthenticateAdmin(adminUserId, reauth, deviceInfo, audit);

    const disableTwoFactor = userId !== adminUserId;
    const tempPassword = crypto.randomBytes(9).toString('base64url'); // 12 URL-safe chars
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
    const now = new Date();
    const twoFactorReset = disableTwoFactor
      ? { isTwoFactorEnabled: false, twoFactorSecret: null, backupCodes: [], twoFactorFailedAttempts: 0, twoFactorLockedUntil: null }
      : {};

    await prisma.$transaction(async (tx) => {
      // Conditional on the 2FA state read above, so what the audit entry and
      // the notification say is what was actually changed.
      const { count } = await tx.user.updateMany({
        where: { id: userId, isTwoFactorEnabled: target.isTwoFactorEnabled },
        data: { passwordHash, mustChangePassword: true, ...twoFactorReset },
      });
      if (count === 0) throw new Error('TARGET_CHANGED');
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
      await tx.trustedDevice.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
    });

    void auditLog({
      userId: adminUserId,
      action: audit.action,
      status: 'success',
      ip: deviceInfo.ip ?? 'unknown',
      details: { ...audit.details, twoFactorDisabled: disableTwoFactor && target.isTwoFactorEnabled },
    });
    if (disableTwoFactor && target.isTwoFactorEnabled) this.notifySecurityEvent(userId, 'twoFactorDisabled', deviceInfo);

    return tempPassword;
  }

  /**
   * #638: step-up check of the acting admin before an action that hands the
   * session holder an admin-capable credential (a password reset, granting
   * the admin role). An open admin session alone is not enough: password,
   * plus the admin's own TOTP or backup code when they have 2FA on (a backup
   * code used here is consumed). Throws REAUTH_REQUIRED (no password sent),
   * INVALID_PASSWORD or INVALID_TOTP_CODE; each refusal is audited with the
   * caller's action and details.
   */
  async reauthenticateAdmin(
    adminUserId: string,
    { password, code }: { password?: string; code?: string },
    deviceInfo: DeviceInfo,
    audit: { action: AuditAction; details: Record<string, unknown> },
  ): Promise<void> {
    const refuse = (error: string): never => {
      void auditLog({
        userId: adminUserId,
        action: audit.action,
        status: 'error',
        ip: deviceInfo.ip ?? 'unknown',
        details: { ...audit.details, error },
      });
      throw new Error(error);
    };

    if (!password) refuse('REAUTH_REQUIRED');
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
    if (!(await bcrypt.compare(password as string, admin.passwordHash))) refuse('INVALID_PASSWORD');
    if (!admin.isTwoFactorEnabled) return;

    let match: { backupCodeHash: string | null } | null = null;
    try {
      match = await this.checkSecondFactorStepUp(admin, code, deviceInfo);
    } catch (err) {
      if (err instanceof Error && err.message === '2FA_TEMPORARILY_LOCKED') refuse(err.message);
      throw err;
    }
    if (!match) refuse('INVALID_TOTP_CODE');
    if (match && match.backupCodeHash) {
      const usedHash = match.backupCodeHash;
      // Conditional on the list read above: two requests racing with the same
      // code, or with two different codes, cannot both write (the second
      // would bring the first one's code back).
      const { count } = await prisma.user.updateMany({
        where: { id: adminUserId, backupCodes: { equals: admin.backupCodes } },
        data: { backupCodes: admin.backupCodes.filter((c) => c !== usedHash) },
      });
      if (count === 0) refuse('INVALID_TOTP_CODE');
    }
  }

  /**
   * Update user preferences (System settings)
   */
  async updatePreferences(userId: string, data: UpdatePreferencesInput): Promise<PublicUser> {
    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: PUBLIC_USER_SELECT,
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

    const base32secret = newTotpSecret();

    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: encrypt(base32secret) },
    });

    // Make sure the qr code and the text secret are perfectly aligned
    const otpauthUrl = totpUri(user.username, base32secret);

    const qrCodeUrl = await qrcode.toDataURL(otpauthUrl);
    return { qrCodeUrl, secret: base32secret };
  }

  /**
   * #603: asks for the password, like turning 2FA off: otherwise whoever
   * holds an open session could tie the account to their own authenticator
   * app and leave with the backup codes, locking the owner out.
   */
  async turnOnTwoFactorAuthentication(userId: string, password: string, code: string, deviceInfo: DeviceInfo): Promise<{ backupCodes: string[] }> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.isTwoFactorEnabled) throw new Error('2FA_ALREADY_ENABLED');
    if (!user.twoFactorSecret) throw new Error('2FA_SECRET_NOT_GENERATED');

    if (!password || !(await bcrypt.compare(password, user.passwordHash))) throw new Error('INVALID_CREDENTIALS');

    if (!(await this.checkTotp(user, code))) throw new Error('INVALID_TOTP_CODE');

    const { backupCodes, hashedBackupCodes } = await this.newBackupCodes();

    await prisma.user.update({
      where: { id: userId },
      data: {
        isTwoFactorEnabled: true,
        backupCodes: hashedBackupCodes,
      },
    });
    // #766 (review): a device trusted while 2FA was off (allowed before) must
    // not skip the code it never had to give.
    await this.revokeAllTrustedDevices(userId);

    this.notifySecurityEvent(userId, 'twoFactorEnabled', deviceInfo);
    this.auditSecurityChange(userId, 'TWO_FACTOR_ON', deviceInfo);

    return { backupCodes }; // Return plain codes ONCE
  }

  /**
   * Ten fresh backup codes, in the clear (shown once) and bcrypt-hashed (the
   * only form stored). 10 bytes (20 hex chars, 80 bits of entropy) rather than
   * the earlier 4 bytes (32 bits) — ISSUE_047: brute force was slowed only by
   * bcrypt and the login rate limiter, not by the codes themselves. See
   * BACKUP_CODE_LENGTH, which every verification site keys off of.
   */
  private async newBackupCodes(): Promise<{ backupCodes: string[]; hashedBackupCodes: string[] }> {
    const backupCodes = Array.from({ length: 10 }).map(() => crypto.randomBytes(10).toString('hex'));
    const hashedBackupCodes = await Promise.all(backupCodes.map(bc => bcrypt.hash(bc, BCRYPT_ROUNDS)));
    return { backupCodes, hashedBackupCodes };
  }

  /**
   * #613: whether `code` is the current code of the user's authenticator app.
   * A secret still stored in the clear is encrypted once it has matched,
   * only if it was not changed in between (2FA turned off, a new secret).
   * That write never blocks the sign-in or the action being confirmed.
   */
  private async checkTotp(user: { id: string; twoFactorSecret: string | null }, code: string): Promise<boolean> {
    if (!user.twoFactorSecret) return false;
    const { secret, legacy } = openTwoFactorSecret(user.twoFactorSecret);
    if (!isCurrentTotp(code, secret)) return false;
    if (legacy) {
      try {
        await prisma.user.updateMany({
          where: { id: user.id, twoFactorSecret: user.twoFactorSecret },
          data: { twoFactorSecret: encrypt(secret) },
        });
      } catch (err) {
        console.error('[auth] Could not encrypt a 2FA secret stored in the clear:', err);
      }
    }
    return true;
  }

  /**
   * Re-confirmation by second factor: a current authenticator code or one of
   * the stored backup codes (compared with bcrypt, never in the clear),
   * telling which backup code matched (so a caller can consume it).
   */
  private async matchSecondFactor(
    user: { id: string; twoFactorSecret: string | null; backupCodes: string[] },
    code?: string,
  ): Promise<{ backupCodeHash: string | null } | null> {
    if (code && code.length === 6 && user.twoFactorSecret) {
      return (await this.checkTotp(user, code)) ? { backupCodeHash: null } : null;
    }
    if (code && code.length === BACKUP_CODE_LENGTH) {
      for (const hashedCode of user.backupCodes) {
        if (await bcrypt.compare(code, hashedCode)) return { backupCodeHash: hashedCode };
      }
    }
    return null;
  }

  /**
   * #889: a second-factor check outside sign-in (turning 2FA off, new backup
   * codes, trusting a device, the admin step-up). It shares the sign-in's
   * per-account counter and lock: wrong codes here count toward the same
   * TWO_FACTOR_MAX_FAILED_ATTEMPTS, a locked account is refused everywhere
   * (2FA_TEMPORARILY_LOCKED), and a right code clears the counter. A request
   * without any code is not a guess and is not counted.
   * `auditAction`: the step-up's own audit action, under which a wrong code
   * (`wrong_2fa_code`) and a lock refusal (`2fa_locked`) are recorded, as at
   * sign-in. Left out by callers that already audit their refusals.
   */
  private async checkSecondFactorStepUp(
    user: { id: string; twoFactorSecret: string | null; backupCodes: string[]; twoFactorFailedAttempts: number; twoFactorLockedUntil: Date | null },
    code: string | undefined,
    deviceInfo: DeviceInfo,
    auditAction?: AuditAction,
  ): Promise<{ backupCodeHash: string | null } | null> {
    const auditRefusal = (reason: 'wrong_2fa_code' | '2fa_locked') => {
      if (auditAction) void auditLog({ userId: user.id, action: auditAction, status: 'error', ip: deviceInfo.ip ?? 'unknown', details: { reason } });
    };
    if (user.twoFactorLockedUntil && user.twoFactorLockedUntil > new Date()) {
      auditRefusal('2fa_locked');
      throw new Error('2FA_TEMPORARILY_LOCKED');
    }

    const match = await this.matchSecondFactor(user, code);
    if (!match) {
      if (code) {
        auditRefusal('wrong_2fa_code');
        await this.registerFailedTwoFactorAttempt(user.id, deviceInfo);
      }
      return null;
    }
    if (user.twoFactorFailedAttempts > 0 || user.twoFactorLockedUntil) {
      await prisma.user.update({ where: { id: user.id }, data: { twoFactorFailedAttempts: 0, twoFactorLockedUntil: null } });
    }
    return match;
  }

  /**
   * #638: replace every backup code by ten new ones — the old ones stop
   * working at once. Same re-confirmation as turning 2FA off: password plus
   * a current authenticator or backup code.
   */
  async regenerateBackupCodes(userId: string, password: string, code: string, deviceInfo: DeviceInfo = {}): Promise<{ backupCodes: string[] }> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.isTwoFactorEnabled) throw new Error('2FA_NOT_ENABLED');

    const validPwd = await bcrypt.compare(password, user.passwordHash);
    if (!validPwd) throw new Error('INVALID_CREDENTIALS');

    if (!(await this.checkSecondFactorStepUp(user, code, deviceInfo, 'BACKUP_CODES_REGENERATE'))) throw new Error('INVALID_TOTP_CODE');

    const { backupCodes, hashedBackupCodes } = await this.newBackupCodes();
    // Conditional on the codes read above still being current: of two
    // concurrent requests, only one replaces them (the other is refused
    // instead of silently voiding the codes the first one showed).
    const { count } = await prisma.user.updateMany({
      where: { id: userId, backupCodes: { equals: user.backupCodes } },
      data: { backupCodes: hashedBackupCodes },
    });
    if (count === 0) throw new Error('INVALID_TOTP_CODE');

    void auditLog({
      userId,
      action: 'BACKUP_CODES_REGENERATE',
      status: 'success',
      ip: deviceInfo.ip ?? 'unknown',
    });
    this.notifySecurityEvent(userId, 'backupCodesRegenerated', deviceInfo);
    return { backupCodes }; // Return plain codes ONCE
  }

  /**
   * #638: how many unused backup codes are left (0 when 2FA is off). Read on
   * its own, not through PUBLIC_USER_SELECT, which never touches the hashes.
   */
  async countBackupCodes(userId: string): Promise<number> {
    const { backupCodes } = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { backupCodes: true } });
    return backupCodes.length;
  }

  async turnOffTwoFactorAuthentication(userId: string, password: string, deviceInfo: DeviceInfo, currentSessionId: string, code?: string): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.isTwoFactorEnabled) throw new Error('2FA_NOT_ENABLED');

    const validPwd = await bcrypt.compare(password, user.passwordHash);
    if (!validPwd) throw new Error('INVALID_CREDENTIALS');

    // Either TOTP or a matching backup code (turning off drops them anyway).
    if (!(await this.checkSecondFactorStepUp(user, code, deviceInfo, 'TWO_FACTOR_OFF'))) throw new Error('INVALID_TOTP_CODE');

    await prisma.user.update({
      where: { id: userId },
      data: {
        isTwoFactorEnabled: false,
        twoFactorSecret: null,
        backupCodes: [],
      },
    });

    this.notifySecurityEvent(userId, 'twoFactorDisabled', deviceInfo);
    this.auditSecurityChange(userId, 'TWO_FACTOR_OFF', deviceInfo);
    // A stolen session must not survive 2FA being turned off (it weakens the
    // account's remaining auth factor, same rationale as a password change).
    await this.revokeOtherSessions(userId, currentSessionId, deviceInfo.ip ?? 'unknown');
    // ISSUE_044: drop the trusted devices as well — they were only ever a
    // shortcut around the 2FA challenge that no longer exists.
    await this.revokeAllTrustedDevices(userId);
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
        // #471: each unit with its family, which holds the description.
        // FEAT-93: and the cells of the cellar plan its copies occupy.
        inventory: { where: { deletedAt: null }, include: { product: true, slots: UNIT_SLOTS_INCLUDE } },
        cellars: true,
        // #471: a collection holds families.
        collections: { include: { products: { select: { id: true, name: true } } } },
        tastingNotes: true,
        // No `take`: respect the configured retention window (SystemConfig
        // .logRetentionDays, purged by MaintenanceService), not an arbitrary
        // row cap — #224.
        auditLogs: { orderBy: { createdAt: 'desc' } },
        wishlistItems: true,
        budgetEnvelopes: true,
        consumptionGoals: true,
        inventoryCountSessions: { include: { entries: true } },
        humidorReadings: true,
        // Metadata only: `tokenHash` is excluded below so the export can
        // never be replayed as a trusted-device bypass credential.
        sessions: { orderBy: { createdAt: 'desc' } },
        trustedDevices: { orderBy: { createdAt: 'desc' } },
        configChangeLogs: { orderBy: { createdAt: 'desc' } },
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
    if (includes('wishlist')) result.wishlist = user.wishlistItems;
    if (includes('budget')) result.budgetEnvelopes = user.budgetEnvelopes;
    if (includes('goals')) result.consumptionGoals = user.consumptionGoals;
    if (includes('counts')) result.inventoryCounts = user.inventoryCountSessions;
    if (includes('humidor')) result.humidorReadings = user.humidorReadings;
    if (includes('activity')) {
      result.activityLog = user.auditLogs.map(l => ({
        action: l.action,
        status: l.status,
        createdAt: l.createdAt,
        ip: l.ip,
      }));
    }
    if (includes('sessions')) {
      result.sessions = user.sessions.map(s => ({
        device: describeDevice(s.userAgent),
        location: locateIp(s.ip),
        rememberMe: s.rememberMe,
        createdAt: s.createdAt,
        lastActiveAt: s.lastActiveAt,
        expiresAt: s.expiresAt,
        revokedAt: s.revokedAt,
      }));
    }
    if (includes('devices')) {
      result.trustedDevices = user.trustedDevices.map(d => ({
        device: describeDevice(d.userAgent),
        country: d.country,
        createdAt: d.createdAt,
        lastUsedAt: d.lastUsedAt,
        expiresAt: d.expiresAt,
        revokedAt: d.revokedAt,
      }));
    }
    if (includes('notifications')) {
      result.notificationPreferences = {
        notifEmail: user.notifEmail,
        notifWebhook: user.notifWebhook,
        notifCategories: user.notifCategories,
        notifQuietStart: user.notifQuietStart,
        notifQuietEnd: user.notifQuietEnd,
        notifLanguage: user.notifLanguage,
      };
    }
    if (includes('configHistory')) {
      // fieldName/maskedOldVal/maskedNewVal are already redacted at write
      // time by logChange (system-config.service) — safe to export as-is.
      result.configHistory = user.configChangeLogs.map(c => ({
        fieldName: c.fieldName,
        maskedOldVal: c.maskedOldVal,
        maskedNewVal: c.maskedNewVal,
        createdAt: c.createdAt,
      }));
    }

    result.included = selected;
    result.exportedAt = new Date().toISOString();
    return result;
  }

  /**
   * #603: asks for the password (an open session alone used to be enough),
   * refuses the last active admin (the anonymisation would leave the
   * instance without one), and tells the owner as well as the other admins.
   */
  async requestAccountDeletion(userId: string, password: string, deviceInfo: DeviceInfo): Promise<void> {
    const account = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true, isAdmin: true, username: true },
    });
    if (!password || !(await bcrypt.compare(password, account.passwordHash))) throw new Error('INVALID_CREDENTIALS');
    if (account.isAdmin && (await countOtherAdmins(prisma, userId)) === 0) throw new Error('CANNOT_DELETE_LAST_ADMIN');

    await prisma.$transaction(async (tx) => {
      // Admins already leaving do not count: two admins asking at once would
      // otherwise each see the other one stay. Counted again here, admin rows
      // locked, so both requests cannot pass together.
      if (account.isAdmin && (await countOtherAdminsLocked(tx, userId)) === 0) throw new Error('CANNOT_DELETE_LAST_ADMIN');
      await tx.user.update({
        where: { id: userId },
        data: { deletionRequestedAt: new Date() },
      });
    });
    void notifyAdminsOfAccountDeletion({ kind: 'requested', username: account.username, requesterId: userId });
    this.notifySecurityEvent(userId, 'accountDeletionRequested', deviceInfo);
  }

  /** #509: called by the maintenance run once due deletions were carried out. */
  async notifyAdminsOfExecutedDeletions(count: number): Promise<void> {
    if (count > 0) await notifyAdminsOfAccountDeletion({ kind: 'executed', count });
  }

  async cancelAccountDeletion(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { deletionRequestedAt: null },
    });
  }

  /**
   * #222: carries out account deletions whose grace period (`cutoff`, set by
   * the caller) has elapsed. `deletionRequestedAt` used to be write-only —
   * nothing ever acted on it, so a deletion request never actually happened
   * and the account stayed fully active.
   *
   * The `User` row is anonymized rather than deleted outright:
   * `Cellar.userId`/`InventoryItem.userId`/`InventoryCountSession.userId`/
   * `HumidorReading.userId` are `onDelete: Restrict` by design (ISSUE_098 —
   * shared inventory/history must never disappear just because the member
   * who happened to create it leaves), so a real `user.delete()` would
   * either fail outright or require reassigning those rows to some other
   * identity. Anonymizing in place keeps every such reference valid while
   * removing the PII GDPR Art. 17 actually targets (email, username,
   * password hash, 2FA secret, avatar...) and deactivating the
   * account (`isActive: false`) so it can no longer sign in.
   *
   * #661: the member's personal data (wishlist, budgets, goals, presets,
   * scans, sessions, devices, guest links...) is deleted outright, the same
   * as when an admin deletes the account for good (deletePersonalData). A
   * member deactivated after asking is processed too.
   *
   * Rows only: the avatar and scan files are deleted by the caller after this
   * transaction commits, same two-phase contract as
   * `inventoryService.purgeTrashed`'s photo paths.
   */
  async purgeDueAccountDeletions(
    cutoff: Date,
    client: PrismaClientOrTx = prisma,
  ): Promise<{ count: number; avatarPaths: string[]; scanImagePaths: string[] }> {
    const due = await client.user.findMany({
      where: { deletionRequestedAt: { not: null, lt: cutoff } },
      select: { id: true, avatarUrl: true },
    });
    if (due.length === 0) return { count: 0, avatarPaths: [], scanImagePaths: [] };

    const ids = due.map((u) => u.id);
    const { scanImagePaths } = await deletePersonalData(ids, client);
    // Their history rows stay (business history is kept for good): no IP
    // address of theirs survives in them, and no name — they read as the
    // anonymised account below. Only an admin's hard delete keeps the name (#695).
    await client.auditLog.updateMany({ where: { userId: { in: ids } }, data: { ip: '', actorName: null } });
    await client.configChangeLog.updateMany({ where: { userId: { in: ids } }, data: { actorName: null } });

    for (const user of due) {
      // A valid bcrypt hash of a random, never-recorded value — not just an
      // arbitrary string — so `bcrypt.compare` on a later login attempt
      // behaves exactly like any other wrong password instead of risking a
      // malformed-hash edge case.
      const unusablePasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS);
      await client.user.update({
        where: { id: user.id },
        data: {
          email: `deleted-${user.id}@deleted.invalid`,
          username: `deleted-${user.id}`,
          passwordHash: unusablePasswordHash,
          displayName: null,
          avatarUrl: null,
          appName: null,
          appSlogan: null,
          notifWebhook: false,
          isTwoFactorEnabled: false,
          twoFactorSecret: null,
          backupCodes: [],
          twoFactorFailedAttempts: 0,
          twoFactorLockedUntil: null,
          pinHash: null,
          autoLockDelayMin: null,
          isActive: false,
          deletionRequestedAt: null,
        },
      });
    }

    const avatarPaths = due
      .map((u) => u.avatarUrl)
      .filter((url): url is string => !!url);
    return { count: due.length, avatarPaths, scanImagePaths };
  }

  /** Deletes the purged accounts' avatar files from disk. Never throws: one bad path must not block the rest. */
  async deleteAvatarFiles(avatarUrls: string[]): Promise<void> {
    // Called once the purge has cleared those accounts' `avatarUrl`.
    for (const avatarUrl of avatarUrls) await this.deleteAvatarFile(avatarUrl, []);
  }

  /**
   * #880: deletes an avatar file only if `avatarUrl` has the exact shape the
   * upload route stores and no account other than `ownerIds` references the
   * same file. Before #880 a member could point their `avatarUrl` at another
   * member's file; such a file is kept. Never throws.
   */
  private async deleteAvatarFile(avatarUrl: string, ownerIds: string[]): Promise<void> {
    const filename = UPLOADED_AVATAR_PATH.exec(avatarUrl)?.[1];
    if (!filename) return;
    try {
      // `endsWith` also catches an absolute address left by an old version.
      const sharedWith = await prisma.user.count({
        where: { id: { notIn: ownerIds }, avatarUrl: { endsWith: `/${filename}` } },
      });
      if (sharedWith > 0) return;
      const filePath = path.join(process.cwd(), 'uploads', 'avatars', filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err) {
      console.error(`[auth] Failed to delete avatar file ${avatarUrl}:`, err);
    }
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
      select: PUBLIC_USER_SELECT,
    });
    return this.toPublicUser(user);
  }

  // ─── 2FA Methods ────────────────────────────────────────────────────────────

  /**
   * Record one wrong 2FA code for `userId`. Once the consecutive-failure
   * budget is spent, lock the challenge for a cooling-off period, reset the
   * counter and warn the account owner (ISSUE_043).
   */
  private async registerFailedTwoFactorAttempt(userId: string, deviceInfo: DeviceInfo): Promise<void> {
    // Atomic increment rather than read-then-write: concurrent guesses (the
    // very shape of a brute-force attempt) must not overwrite each other's
    // count and silently refill the budget.
    const { twoFactorFailedAttempts: failures } = await prisma.user.update({
      where: { id: userId },
      data: { twoFactorFailedAttempts: { increment: 1 } },
      select: { twoFactorFailedAttempts: true },
    });

    if (failures < TWO_FACTOR_MAX_FAILED_ATTEMPTS) return;

    // Budget spent: start the cooling-off period and reset the counter, so
    // the next window starts from a clean slate once the lock expires.
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorFailedAttempts: 0, twoFactorLockedUntil: new Date(Date.now() + TWO_FACTOR_LOCK_DURATION_MS) },
    });
    this.notifySecurityEvent(userId, 'twoFactorLocked', deviceInfo);
  }

  /**
   * ISSUE_043: per-account throttling of the second factor. The per-IP rate
   * limiter in app.ts is trivially sidestepped by rotating addresses, so the
   * consecutive-failure counter lives on the account itself: after
   * TWO_FACTOR_MAX_FAILED_ATTEMPTS wrong codes the challenge is locked for
   * TWO_FACTOR_LOCK_DURATION_MS and the owner is notified. Any successful
   * verification clears the counter.
   */
  async verifyTwoFactorLogin(
    userId: string,
    code: string,
    rememberMe: boolean,
    deviceInfo: DeviceInfo,
    trustDevice = false,
  ): Promise<{ user: PublicUser; token: string; rememberMe: boolean; trustedDeviceToken?: string; knownBrowserToken?: string }> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.isTwoFactorEnabled) throw new Error('2FA_NOT_ENABLED');

    if (user.twoFactorLockedUntil && user.twoFactorLockedUntil > new Date()) {
      throw new Error('2FA_TEMPORARILY_LOCKED');
    }

    let validCode = false;
    let usedBackupCodeHash: string | null = null;

    if (code.length === 6 && user.twoFactorSecret) {
      validCode = await this.checkTotp(user, code);
    } else if (code.length === BACKUP_CODE_LENGTH && user.backupCodes.length > 0) {
      for (const hashedCode of user.backupCodes) {
        if (await bcrypt.compare(code, hashedCode)) {
          validCode = true;
          usedBackupCodeHash = hashedCode;
          break;
        }
      }
    }

    if (!validCode) {
      this.auditLoginFailure(user.id, deviceInfo, 'wrong_2fa_code');
      await this.registerFailedTwoFactorAttempt(user.id, deviceInfo);
      throw new Error('INVALID_TOTP_CODE');
    }

    // Successful verification clears the brute-force counter (ISSUE_043) and,
    // if a backup code was used, consumes it — both in a single write.
    const remainingCodes = usedBackupCodeHash
      ? user.backupCodes.filter(c => c !== usedBackupCodeHash)
      : undefined;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorFailedAttempts: 0,
        twoFactorLockedUntil: null,
        ...(remainingCodes ? { backupCodes: remainingCodes } : {}),
      },
    });

    const publicUser: PublicUser = this.toPublicUser(user);

    const isKnownDevice = await this.isKnownDeviceLocation(user.id, deviceInfo);
    const session = await this.createSession(user.id, deviceInfo, rememberMe);
    const token = signToken({ userId: user.id, email: user.email, username: user.username, scope: 'full', sessionId: session.id });
    if (!isKnownDevice) this.notifySecurityEvent(user.id, 'newDevice', deviceInfo);

    let trustedDeviceToken: string | undefined;
    if (trustDevice) {
      trustedDeviceToken = await this.createTrustedDevice(user.id, deviceInfo);
    }

    return { user: publicUser, token, rememberMe, trustedDeviceToken, knownBrowserToken: knownBrowserToken(user) };
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
   * #773: "sign out all other sessions", one action instead of one per
   * session. The current session stays; the owner is told once, with the
   * device that asked (a stolen session doing this must not go unnoticed).
   * Review R2: the other trusted devices stop being trusted too (a thief
   * knowing the password would otherwise skip the 2FA code there); the one
   * whose cookie came with the request, `currentDeviceToken`, keeps its trust.
   * Returns the number of sessions signed out.
   */
  async revokeAllOtherSessions(userId: string, currentSessionId: string, deviceInfo: DeviceInfo, currentDeviceToken?: string): Promise<number> {
    const revoked = await this.revokeOtherSessions(userId, currentSessionId, deviceInfo.ip ?? 'unknown', 'sign_out_other_sessions');
    const keep = currentDeviceToken ? crypto.createHash('sha256').update(currentDeviceToken).digest('hex') : undefined;
    const { count: untrusted } = await prisma.trustedDevice.updateMany({
      where: { userId, revokedAt: null, ...(keep ? { NOT: { tokenHash: keep } } : {}) },
      data: { revokedAt: new Date() },
    });
    if (revoked > 0 || untrusted > 0) this.notifySecurityEvent(userId, 'otherSessionsRevoked', deviceInfo);
    return revoked;
  }

  /**
   * Mark the caller's current device as trusted outside of the 2FA login
   * flow (e.g. a "Trust this device" button in security settings).
   */
  /**
   * ISSUE_045: a trusted device is a lasting (30-day, self-renewing) 2FA
   * bypass, so minting one re-confirms identity the same way turning 2FA
   * off does — password always, plus a TOTP/backup code when 2FA is
   * actually enabled on the account. Unlike the login-time auto-trust path
   * (verifyTwoFactorLogin, which calls `createTrustedDevice` directly), this
   * standalone route previously asked for nothing at all.
   */
  async trustCurrentDevice(userId: string, deviceInfo: DeviceInfo, password: string, code?: string): Promise<{ token: string }> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    // #766: without 2FA there is no code to skip; a device trusted now would
    // only start to matter, unnoticed, the day 2FA is turned on.
    if (!user.isTwoFactorEnabled) throw new Error('TWO_FACTOR_DISABLED');

    const validPwd = await bcrypt.compare(password, user.passwordHash);
    if (!validPwd) throw new Error('INVALID_CREDENTIALS');

    if (!(await this.checkSecondFactorStepUp(user, code, deviceInfo))) {
      throw new Error('INVALID_CODE');
    }

    const token = await this.createTrustedDevice(userId, deviceInfo);
    return { token };
  }

  /**
   * #766: until when the device holding `trustedDeviceToken` skips the 2FA
   * code for `userId`, or null when it does not (no cookie, revoked, expired,
   * another account's). `cookieExpiresAt` is the cookie's own end: the
   * browser drops it then, whatever the row says.
   */
  async trustedDeviceUntil(userId: string, trustedDeviceToken: string | undefined, cookieExpiresAt?: Date): Promise<Date | null> {
    if (!trustedDeviceToken) return null;
    const tokenHash = crypto.createHash('sha256').update(trustedDeviceToken).digest('hex');
    const device = await prisma.trustedDevice.findUnique({ where: { tokenHash } });
    const now = new Date();
    if (!device || device.userId !== userId || device.revokedAt || device.expiresAt <= now) return null;
    return cookieExpiresAt && cookieExpiresAt < device.expiresAt ? cookieExpiresAt : device.expiresAt;
  }

  /**
   * Revoke the TrustedDevice matching the given raw token, if it belongs to `userId`.
   */
  async untrustCurrentDevice(userId: string, trustedDeviceToken: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(trustedDeviceToken).digest('hex');
    const device = await prisma.trustedDevice.findUnique({ where: { tokenHash } });
    // #766 (review): nothing of this account's to revoke (deleted meanwhile,
    // another account's cookie): stopping trust is already true.
    if (!device || device.userId !== userId) return;

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
  secure: isCookieSecure(),
  sameSite: 'strict' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/',
};

// #988: known-browser cookie, see knownBrowserToken. Set on every completed
// sign-in (2FA or not) and renewed by a password change. It only lets that
// browser past a locked sign-in identifier (signInAccountLimiter); it never
// skips 2FA. Same flags and scope as the trusted-device cookie, kept on
// logout for the same reason, valid 30 days from the last sign-in, void as
// soon as the password changes.
export const KNOWN_BROWSER_COOKIE_NAME = 'glou_known_browser';
export const KNOWN_BROWSER_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isCookieSecure(),
  sameSite: 'strict' as const,
  maxAge: KNOWN_BROWSER_TTL_MS,
  path: '/api/auth',
};

// Session cookie (rememberMe=false) — expires when browser closes
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isCookieSecure(),
  sameSite: 'strict' as const,
  path: '/',
};

type AccountDeletionEvent =
  | { kind: 'requested'; username: string; requesterId: string }
  | { kind: 'executed'; count: number };

/**
 * #509: account deletion is automatic after ACCOUNT_DELETION_GRACE_DAYS, and
 * admins used to learn about it only from "deleted-…" names in the history.
 * They are now told when a member asks and when the deletion is carried out.
 * Never throws: a notification failure must not block the request itself.
 */
async function notifyAdminsOfAccountDeletion(event: AccountDeletionEvent): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { isAdmin: true, isActive: true, ...(event.kind === 'requested' ? { id: { not: event.requesterId } } : {}) },
      select: { id: true, language: true, notifLanguage: true },
    });
    const dueOn = new Date(Date.now() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await Promise.all(admins.map((admin) => {
      const en = isNotifEn(admin);
      let subject: string;
      let htmlBody: string;
      if (event.kind === 'requested') {
        const name = escapeHtml(event.username);
        subject = en ? `Account deletion requested: ${event.username}` : `Demande de suppression de compte : ${event.username}`;
        htmlBody = en
          ? `<p><strong>${name}</strong> asked for their account to be deleted. It will be anonymised automatically on ${dueOn} unless they cancel before then. No action is needed from you.</p>`
          : `<p><strong>${name}</strong> a demandé la suppression de son compte. Il sera anonymisé automatiquement le ${dueOn}, sauf annulation de sa part d'ici là. Aucune action n'est requise de votre part.</p>`;
      } else {
        const plural = event.count > 1;
        subject = en
          ? `${event.count} account${plural ? 's' : ''} deleted`
          : `${event.count} compte${plural ? 's' : ''} supprimé${plural ? 's' : ''}`;
        htmlBody = en
          ? `<p>${event.count} account${plural ? 's were' : ' was'} anonymised, ${ACCOUNT_DELETION_GRACE_DAYS} days after the member's deletion request. Their past edits now show as "deleted-…" in the history.</p>`
          : `<p>${event.count} compte${plural ? 's ont été anonymisés' : ' a été anonymisé'}, ${ACCOUNT_DELETION_GRACE_DAYS} jours après la demande de suppression du membre. Ses modifications passées apparaissent désormais comme « deleted-… » dans l'historique.</p>`;
      }
      // #742: the "N accounts deleted" notice is sent by the 3 a.m.
      // maintenance run, inside most night-time quiet hours, which drop a
      // message rather than delay it, so it goes through them.
      // #981: about a member's account, not the admin's own: an admin can
      // turn these off, unlike security alerts.
      return notificationService.send({ userId: admin.id, category: 'members', subject, htmlBody, bypassQuietHours: true });
    }));
  } catch (err) {
    console.error('[auth] Could not notify administrators of an account deletion:', err);
  }
}
