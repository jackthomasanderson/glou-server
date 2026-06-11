import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { authService } from '../src/services/auth.service';
import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Theme, Language, TempUnit, DateFormat } from '@prisma/client';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(),
  },
}));

describe('AuthService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, JWT_SECRET: 'test-secret' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('register', () => {
    const validData = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123456',
      displayName: 'Test User',
    };

    it('should create a user and return a token when data is valid', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.user.count).mockResolvedValue(0);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashedPassword' as never);
      const mockCreatedUser = {
        id: '1',
        username: validData.username,
        email: validData.email,
        displayName: validData.displayName,
        avatarUrl: null,
        appName: null,
        appSlogan: null,
        theme: Theme.LIGHT,
        language: Language.FR,
        tempUnit: TempUnit.CELSIUS,
        accentColor: '#6366f1',
        dateFormat: DateFormat.SYSTEM,
        isTwoFactorEnabled: false,
        twoFactorSecret: null,
        backupCodes: [],
        isAdmin: false,
        isActive: true,
        passwordHash: 'hashedPassword',
        deletionRequestedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.user.create).mockResolvedValue(mockCreatedUser);
      vi.mocked(jwt.sign).mockReturnValue('mock-jwt-token' as never);

      const result = await authService.register(validData);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ username: validData.username }, { email: validData.email }] },
        select: { username: true, email: true },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(validData.password, 12);
      expect(prisma.user.create).toHaveBeenCalled();
      expect(result.token).toBe('mock-jwt-token');
      expect(result.user.username).toBe(validData.username);
    });

    it('should throw USERNAME_ALREADY_TAKEN if username exists', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ username: validData.username, email: 'other@example.com' } as any);

      await expect(authService.register(validData)).rejects.toThrow('USERNAME_ALREADY_TAKEN');
    });

    it('should throw EMAIL_ALREADY_TAKEN if email exists', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ username: 'other', email: validData.email } as any);

      await expect(authService.register(validData)).rejects.toThrow('EMAIL_ALREADY_TAKEN');
    });
  });

  describe('login', () => {
    const loginData = {
      identifier: 'testuser',
      password: 'password123456',
      rememberMe: false,
    };

    const mockUser = {
      id: '1',
      username: 'testuser',
      email: 'test@example.com',
      displayName: 'Test User',
      passwordHash: 'hashedPassword',
      avatarUrl: null,
      appName: null,
      appSlogan: null,
      theme: Theme.LIGHT,
      language: Language.FR,
      tempUnit: TempUnit.CELSIUS,
      accentColor: '#6366f1',
      dateFormat: DateFormat.SYSTEM,
      isTwoFactorEnabled: false,
      twoFactorSecret: null,
      backupCodes: [],
      isAdmin: false,
      isActive: true,
      deletionRequestedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return user and token for valid credentials', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(jwt.sign).mockReturnValue('mock-jwt-token' as never);

      const result = await authService.login(loginData);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ username: loginData.identifier }, { email: loginData.identifier }] },
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(loginData.password, mockUser.passwordHash);
      expect(result.token).toBe('mock-jwt-token');
      expect(result.user.username).toBe(mockUser.username);
    });

    it('should throw INVALID_CREDENTIALS if user not found', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

      await expect(authService.login(loginData)).rejects.toThrow('INVALID_CREDENTIALS');
    });

    it('should throw INVALID_CREDENTIALS if password does not match', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(authService.login(loginData)).rejects.toThrow('INVALID_CREDENTIALS');
    });
  });
});
