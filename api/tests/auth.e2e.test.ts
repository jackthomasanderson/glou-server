import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Theme, Language, TempUnit, DateFormat } from '@prisma/client';

// ── Mock prisma BEFORE importing router (hoisted by vitest) ──────────────────

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

// ── Mock bcryptjs ────────────────────────────────────────────────────────────

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
    genSalt: vi.fn(),
  },
  hash: vi.fn(),
  compare: vi.fn(),
}));

// ── Mock jsonwebtoken ────────────────────────────────────────────────────────

vi.mock('jsonwebtoken', () => {
  const originalModule = vi.importActual('jsonwebtoken');
  return {
    default: {
      sign: vi.fn(),
      verify: vi.fn(),
    },
    sign: vi.fn(),
    verify: vi.fn(),
  };
});

// ── Mock speakeasy & qrcode (2FA) ────────────────────────────────────────────

vi.mock('speakeasy', () => ({
  default: {
    generateSecret: vi.fn(),
    otpauthURL: vi.fn(),
    totp: {
      verify: vi.fn(),
    },
  },
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(),
  },
}));

// ── Imports (after mocks are hoisted) ────────────────────────────────────────

import { prisma } from '../src/lib/prisma';
import { authRouter } from '../src/routes/auth.router';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Create a mock user object matching the full Prisma schema shape
 * returned by `prisma.user.findFirst` / `findUniqueOrThrow`.
 */
function mockUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'user-1',
    username: 'testuser',
    email: 'test@example.com',
    displayName: 'Test User',
    passwordHash: 'hashedPassword',
    avatarUrl: null,
    appName: null,
    appSlogan: null,
    theme: Theme.SYSTEM,
    language: Language.EN,
    tempUnit: TempUnit.CELSIUS,
    accentColor: '#6366f1',
    dateFormat: DateFormat.SYSTEM,
    isTwoFactorEnabled: false,
    twoFactorSecret: null,
    backupCodes: [],
    isAdmin: false,
    isActive: true,
    deletionRequestedAt: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

/**
 * Public user shape (what the API returns — excludes internal fields).
 * Matches the `PublicUser` interface in auth.service.ts.
 */
function mockPublicUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'user-1',
    username: 'testuser',
    email: 'test@example.com',
    avatarUrl: null,
    appName: null,
    appSlogan: null,
    theme: Theme.SYSTEM,
    language: Language.EN,
    tempUnit: TempUnit.CELSIUS,
    accentColor: '#6366f1',
    dateFormat: DateFormat.SYSTEM,
    isAdmin: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    deletionRequestedAt: null,
    ...overrides,
  };
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('Auth E2E — Full Auth Flow (mocked Prisma)', () => {
  let app: express.Express;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, JWT_SECRET: 'test-jwt-secret' };

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', authRouter);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 1. Register
  // ────────────────────────────────────────────────────────────────────────────

  describe('POST /api/auth/register', () => {
    const validBody = {
      username: 'newuser',
      email: 'new@example.com',
      password: 'twelvechars!!',
      displayName: 'New User',
    };

    it('registers a new user and returns user data with 201', async () => {
      // No existing user
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.user.count).mockResolvedValue(5);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashedPassword' as never);
      // authService.register() selects only public fields (excludes passwordHash)
      const { passwordHash: _, ...publicUser } = mockUser({
        id: 'user-new',
        username: 'newuser',
        email: 'new@example.com',
        isAdmin: false,
      });
      vi.mocked(prisma.user.create).mockResolvedValue(publicUser);
      vi.mocked(jwt.sign).mockReturnValue('jwt-register-token');

      const res = await request(app)
        .post('/api/auth/register')
        .send(validBody)
        .expect(201);

      expect(res.body.data).toMatchObject({
        username: 'newuser',
        email: 'new@example.com',
      });
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data).not.toHaveProperty('passwordHash');
      // Cookie should be set
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('returns 409 when username is already taken', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        username: 'newuser',
        email: 'other@example.com',
      } as any);

      const res = await request(app)
        .post('/api/auth/register')
        .send(validBody)
        .expect(409);

      expect(res.body.error).toBe('USERNAME_ALREADY_TAKEN');
    });

    it('returns 400 on invalid payload (missing password)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'x', email: 'x@x.com' })
        .expect(400);

      expect(res.body.error).toBe('VALIDATION_ERROR');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. Login
  // ────────────────────────────────────────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    const loginBody = {
      identifier: 'testuser',
      password: 'twelvechars!!',
      rememberMe: false,
    };

    it('logs in with valid credentials and returns token + user', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser());
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(jwt.sign).mockReturnValue('jwt-login-token');

      const res = await request(app)
        .post('/api/auth/login')
        .send(loginBody)
        .expect(200);

      expect(res.body.data).toMatchObject({
        username: 'testuser',
        email: 'test@example.com',
        id: 'user-1',
      });
      expect(res.body.data).not.toHaveProperty('passwordHash');
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('returns 401 for invalid credentials (wrong password)', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser());
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      const res = await request(app)
        .post('/api/auth/login')
        .send(loginBody)
        .expect(401);

      expect(res.body.error).toBe('INVALID_CREDENTIALS');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3. Get current user (protected)
  // ────────────────────────────────────────────────────────────────────────────

  describe('GET /api/auth/me', () => {
    const tokenPayload = { userId: 'user-1', email: 'test@example.com', scope: 'full' };

    function setupAuthMiddlewareMocks() {
      vi.mocked(jwt.verify).mockReturnValue(tokenPayload);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        mockUser({ id: 'user-1' }),
      );
      vi.mocked(prisma.user.findFirst).mockResolvedValue(
        mockUser({ id: 'user-1' }),
      );
    }

    it('returns current user profile for authenticated request', async () => {
      setupAuthMiddlewareMocks();

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer valid-jwt')
        .expect(200);

      expect(res.body.data).toMatchObject({
        id: 'user-1',
        username: 'testuser',
        email: 'test@example.com',
      });
    });

    it('returns 401 without authorization header', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(res.body.error).toBe('UNAUTHORIZED');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4. 2FA generate
  // ────────────────────────────────────────────────────────────────────────────

  describe('POST /api/auth/2fa/generate', () => {
    const tokenPayload = { userId: 'user-1', email: 'test@example.com', scope: 'full' };

    function setupAuthAnd2faMocks() {
      // Auth middleware
      vi.mocked(jwt.verify).mockReturnValue(tokenPayload);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        mockUser({ id: 'user-1', isTwoFactorEnabled: false }),
      );
      // generateTwoFactorSecret service call
      vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(
        mockUser({ id: 'user-1', isTwoFactorEnabled: false }),
      );
      vi.mocked(speakeasy.generateSecret).mockReturnValue({
        base32: 'JBSWY3DPEHPK3PXP',
        otpauth_url: 'otpauth://totp/Glou:testuser?secret=JBSWY3DPEHPK3PXP',
      } as any);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser());
      vi.mocked(qrcode.toDataURL).mockResolvedValue('data:image/png;base64,QRCODE_DATA');
      vi.mocked(speakeasy.otpauthURL).mockReturnValue(
        'otpauth://totp/Glou:testuser?secret=JBSWY3DPEHPK3PXP',
      );
    }

    it('generates 2FA secret and returns QR code data', async () => {
      setupAuthAnd2faMocks();

      const res = await request(app)
        .post('/api/auth/2fa/generate')
        .set('Authorization', 'Bearer valid-jwt')
        .expect(200);

      expect(res.body.data).toHaveProperty('qrCodeUrl');
      expect(res.body.data).toHaveProperty('secret');
      expect(res.body.data.qrCodeUrl).toContain('data:image/png;base64');
    });

    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/api/auth/2fa/generate')
        .expect(401);

      expect(res.body.error).toBe('UNAUTHORIZED');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 5. 2FA turn-on (verify)
  // ────────────────────────────────────────────────────────────────────────────

  describe('POST /api/auth/2fa/turn-on', () => {
    const tokenPayload = { userId: 'user-1', email: 'test@example.com', scope: 'full' };

    function setupAuthAndTurnOnMocks() {
      // Auth middleware
      vi.mocked(jwt.verify).mockReturnValue(tokenPayload);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        mockUser({ id: 'user-1', isTwoFactorEnabled: false }),
      );
      // turnOnTwoFactorAuthentication service call
      vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(
        mockUser({
          id: 'user-1',
          isTwoFactorEnabled: false,
          twoFactorSecret: 'JBSWY3DPEHPK3PXP',
          backupCodes: [],
        }),
      );
      vi.mocked(speakeasy.totp.verify).mockReturnValue(true);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashedBackupCode' as never);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser({
        isTwoFactorEnabled: true,
        backupCodes: ['hashed1', 'hashed2'],
      }));
    }

    it('verifies TOTP code and enables 2FA, returns backup codes', async () => {
      setupAuthAndTurnOnMocks();

      const res = await request(app)
        .post('/api/auth/2fa/turn-on')
        .set('Authorization', 'Bearer valid-jwt')
        .send({ code: '123456' })
        .expect(200);

      expect(res.body.data).toHaveProperty('backupCodes');
      expect(Array.isArray(res.body.data.backupCodes)).toBe(true);
      expect(res.body.data.backupCodes.length).toBe(10);
    });

    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/api/auth/2fa/turn-on')
        .send({ code: '123456' })
        .expect(401);

      expect(res.body.error).toBe('UNAUTHORIZED');
    });
  });
});