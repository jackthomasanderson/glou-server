import { describe, it, expect, beforeEach, vi } from 'vitest';

// #981: a stolen session could remove the `security` category or turn the
// e-mail channel off, then change the password unnoticed. Security alerts are
// now mandatory: the real alert pipeline (auth service → notification
// service) is run here, only the database, bcrypt and the mailer are stubbed.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    session: { findMany: vi.fn(), updateMany: vi.fn() },
    trustedDevice: { updateMany: vi.fn() },
  },
}));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(), compare: vi.fn() } }));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../src/services/email.service', () => ({
  emailService: { send: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../../src/services/system-config.service', () => ({
  systemConfigService: {
    getPublic: vi.fn(),
    getGotify: vi.fn().mockResolvedValue({ gotifyEnabled: false, gotifyUrl: null, gotifyToken: null }),
    getEffectivePublicUrl: vi.fn().mockResolvedValue('https://glou.example'),
  },
}));

import bcrypt from 'bcryptjs';
import { prisma } from '../../src/lib/prisma';
import { emailService } from '../../src/services/email.service';
import { systemConfigService } from '../../src/services/system-config.service';
import { authService } from '../../src/services/auth.service';

/** An account an earlier session silenced: category removed, both channels off. */
const silencedAccount = {
  id: 'u1', username: 'marie', email: 'marie@example.com', isActive: true,
  language: 'EN', notifLanguage: null,
  notifEmail: false, notifWebhook: false, notifCategories: ['peak'],
  notifQuietStart: null, notifQuietEnd: null,
};

/** The alert is fire-and-forget: wait until the mailer was reached. */
const mailed = () => vi.waitFor(() => expect(emailService.send).toHaveBeenCalled());

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(systemConfigService.getPublic).mockResolvedValue({ smtpEnabled: true } as never);
  vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({ ...silencedAccount, passwordHash: 'stored' } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...silencedAccount } as never);
  vi.mocked(prisma.user.update).mockResolvedValue({} as never);
  vi.mocked(prisma.session.findMany).mockResolvedValue([]);
  vi.mocked(prisma.trustedDevice.updateMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
  vi.mocked(bcrypt.hash).mockResolvedValue('new-hash' as never);
});

describe('a password change warns the account e-mail, whatever was switched off (#981)', () => {
  it('e-mails the account address although the category was removed and the e-mail channel turned off', async () => {
    await authService.updatePassword('u1', 'old', 'new-password-1', { ip: '203.0.113.5', userAgent: 'curl/8' }, 's1');

    await mailed();
    expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'marie@example.com',
      subject: expect.stringMatching(/password/i),
    }));
  });
});
