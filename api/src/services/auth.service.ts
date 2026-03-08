import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { RegisterInput, LoginInput } from '../schemas/auth.schema';

const JWT_EXPIRES_IN = '30d';
const BCRYPT_ROUNDS = 12;

export interface AuthPayload {
  userId: string;
  email: string;
  username: string;
}

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
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
   * Throws with code string if username/email already taken.
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
      select: { id: true, username: true, email: true, displayName: true, createdAt: true },
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
      createdAt: user.createdAt,
    };

    const token = signToken({ userId: user.id, email: user.email, username: user.username });
    return { user: publicUser, token };
  }

  /**
   * Return current user's public profile.
   */
  async me(userId: string): Promise<PublicUser | null> {
    const user = await prisma.user.findFirst({
      where: { id: userId },
      select: { id: true, username: true, email: true, displayName: true, createdAt: true },
    });
    return user;
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
