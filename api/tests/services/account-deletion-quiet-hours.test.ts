import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// #742: the "N accounts deleted" notice is sent by the 3 a.m. maintenance
// run. Quiet hours drop a message (they do not delay it), so an admin with
// night-time quiet hours never got it. The real notification service runs
// here: only the database and the mail transport are stand-ins.

vi.mock('../../src/lib/prisma', () => ({
  prisma: { user: { findMany: vi.fn(), findUnique: vi.fn() } },
}));
vi.mock('../../src/services/email.service', () => ({
  emailService: { send: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../../src/services/system-config.service', () => ({
  systemConfigService: {
    getPublic: vi.fn().mockResolvedValue({ smtpEnabled: true }),
    getGotify: vi.fn().mockResolvedValue({ gotifyEnabled: false, gotifyUrl: null, gotifyToken: null }),
    getEffectivePublicUrl: vi.fn().mockResolvedValue('https://glou.example'),
  },
}));

import { prisma } from '../../src/lib/prisma';
import { emailService } from '../../src/services/email.service';
import { authService } from '../../src/services/auth.service';
import { hourInTimeZone } from '../../src/lib/quiet-hours';

const admin = {
  id: 'admin1',
  username: 'admin',
  email: 'admin@example.com',
  language: 'EN',
  isActive: true,
  isAdmin: true,
  notifEmail: true,
  notifWebhook: false,
  notifCategories: [],
  // Night-time quiet hours.
  notifQuietStart: 22,
  notifQuietEnd: 7,
  notifLanguage: null,
};

/** 3:00 in the process's time zone, the one quiet hours are read in (#575). */
function threeAmLocal(): Date {
  const d = new Date('2027-01-15T12:00:00Z');
  d.setHours(3, 0, 0, 0);
  return d;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(threeAmLocal());
  vi.mocked(prisma.user.findMany).mockResolvedValue([admin] as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(admin as never);
});
afterEach(() => vi.useRealTimers());

describe('the 3 a.m. "accounts deleted" notice and quiet hours (#742)', () => {
  it('runs inside the admin\'s 22:00 → 07:00 quiet hours', () => {
    expect(hourInTimeZone(new Date())).toBe(3);
  });

  it('still reaches an admin whose quiet hours cover 3 a.m.', async () => {
    await authService.notifyAdminsOfExecutedDeletions(2);

    expect(emailService.send).toHaveBeenCalledTimes(1);
    expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'admin@example.com', subject: '2 accounts deleted' }));
  });
});
