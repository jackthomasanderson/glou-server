import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { RegisterInput, LoginInput } from '../schemas/auth.schema';
import { UpdateProfileInput, UpdatePreferencesInput } from '../schemas/user.schema';
import { Theme, Language, TempUnit } from '@prisma/client';

const JWT_EXPIRES_IN = '30d';
const BCRYPT_ROUNDS = 12;

export interface AuthPayload {
  userId: string;
  email: string;
  username: string;
  scope?: 'full' | '2fa_pending';
}

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  appName: string | null;
  appSlogan: string | null;
  theme: Theme;
  language: Language;
  tempUnit: TempUnit;
  isAdmin: boolean;
  createdAt: Date;
}

function signToken(payload: AuthPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET_NOT_SET');
  return jwt.sign(payload, secret, { expiresIn: JWT_EXPIRES_IN });
}

export class AuthService {
  /**
   * Register a new user.
   */
  async register(data: RegisterInput): Promise<{ user: PublicUser; token: string }> {
    const { username, email, password, displayName } = data;

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

    const user = await prisma.user.create({
      data: {
        username,
        email,
        displayName: displayName ?? null,
        passwordHash,
      },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        appName: true,
        appSlogan: true,
        theme: true,
        language: true,
        tempUnit: true,
        isAdmin: true,
        createdAt: true
      },
    });

    const token = signToken({ userId: user.id, email: user.email, username: user.username });
    return { user, token };
  }

  /**
   * Login with username OR email + password.
   */
  async login(data: LoginInput): Promise<{ user: PublicUser; token: string }> {
    const { identifier, password } = data;

    // Accept username or email
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ username: identifier }, { email: identifier }],
      },
    });

    if (!user) throw new Error('INVALID_CREDENTIALS');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new Error('INVALID_CREDENTIALS');

    const publicUser: PublicUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      appName: user.appName,
      appSlogan: user.appSlogan,
      theme: user.theme,
      language: user.language,
      tempUnit: user.tempUnit,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
    };

    if (user.isTwoFactorEnabled) {
      const token = signToken({ userId: user.id, email: user.email, username: user.username, scope: '2fa_pending' });
      return { user: publicUser, token, requires2fa: true } as any; // Type hack for now
    }

    const token = signToken({ userId: user.id, email: user.email, username: user.username, scope: 'full' });
    return { user: publicUser, token };
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
        displayName: true,
        avatarUrl: true,
        appName: true,
        appSlogan: true,
        theme: true,
        language: true,
        tempUnit: true,
        isAdmin: true,
        createdAt: true
      },
    });
    return user;
  }

  /**
   * Update user profile (UI-facing infos)
   */
  async updateProfile(userId: string, data: UpdateProfileInput): Promise<PublicUser> {
    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        appName: true,
        appSlogan: true,
        theme: true,
        language: true,
        tempUnit: true,
        isAdmin: true,
        createdAt: true
      },
    });
    return user;
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
        displayName: true,
        avatarUrl: true,
        appName: true,
        appSlogan: true,
        theme: true,
        language: true,
        tempUnit: true,
        isAdmin: true,
        createdAt: true
      }
    });
    return user;
  }

  /**
   * Update user password
   */
  async updatePassword(userId: string, currentPass: string, newPass: string): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const valid = await bcrypt.compare(currentPass, user.passwordHash);
    if (!valid) throw new Error('INVALID_CREDENTIALS');

    const passwordHash = await bcrypt.hash(newPass, BCRYPT_ROUNDS);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash }
    });
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
        displayName: true,
        avatarUrl: true,
        appName: true,
        appSlogan: true,
        theme: true,
        language: true,
        tempUnit: true,
        isAdmin: true,
        createdAt: true
      },
    });
    return user;
  }

  // ─── 2FA Methods ────────────────────────────────────────────────────────────

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

  async turnOnTwoFactorAuthentication(userId: string, code: string): Promise<{ backupCodes: string[] }> {
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

    return { backupCodes }; // Return plain codes ONCE
  }

  async turnOffTwoFactorAuthentication(userId: string, password: string, code?: string): Promise<void> {
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
  }

  async verifyTwoFactorLogin(userId: string, code: string): Promise<{ user: PublicUser; token: string }> {
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

    const publicUser: PublicUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      appName: user.appName,
      appSlogan: user.appSlogan,
      theme: user.theme,
      language: user.language,
      tempUnit: user.tempUnit,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
    };

    const token = signToken({ userId: user.id, email: user.email, username: user.username, scope: 'full' });
    return { user: publicUser, token };
  }
}

export const authService = new AuthService();

// Cookie settings helper
export const COOKIE_NAME = 'glou_token';
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
  path: '/',
};
