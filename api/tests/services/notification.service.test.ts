import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));
vi.mock('../../src/services/email.service', () => ({
  emailService: { send: vi.fn().mockResolvedValue(undefined), sendTestEmail: vi.fn() },
}));
vi.mock('../../src/services/system-config.service', () => ({
  systemConfigService: { getPublic: vi.fn().mockResolvedValue({ smtpEnabled: true }) },
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { prisma } from '../../src/lib/prisma';
import { notificationService } from '../../src/services/notification.service';

const baseUser = {
  id: 'u1',
  email: 'a@b.com',
  notifEmail: false,
  notifInApp: false,
  notifWebhook: true,
  notifCategories: [],
  notifQuietStart: null,
  notifQuietEnd: null,
  webhookUrl: 'https://1.2.3.4/hook',
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
});

describe('notificationService.send — webhook SSRF guard (ISSUE_048)', () => {
  it('refuses to call a webhook pointed at an internal address', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser, webhookUrl: 'https://127.0.0.1:8080/hook' } as never);

    await notificationService.send({ userId: 'u1', category: 'security', subject: 's', htmlBody: 'b' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls a webhook pointed at a public address', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser } as never);

    await notificationService.send({ userId: 'u1', category: 'security', subject: 's', htmlBody: 'b' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('1.2.3.4');
  });
});

describe('notificationService.testChannel — webhook (ISSUE_048)', () => {
  it('rejects an internal webhook URL without ever calling fetch', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser, webhookUrl: 'https://10.0.0.5/hook' } as never);

    const res = await notificationService.testChannel('u1', 'webhook');

    expect(res).toEqual({ success: false, error: 'INVALID_URL' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never leaks the raw HTTP status or network error back to the caller', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser } as never);
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    const res = await notificationService.testChannel('u1', 'webhook');

    expect(res).toEqual({ success: false, error: 'DELIVERY_FAILED' });
  });

  it('reports a network failure with the same generic code, never the exception message', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser } as never);
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:8080'));

    const res = await notificationService.testChannel('u1', 'webhook');

    expect(res).toEqual({ success: false, error: 'DELIVERY_FAILED' });
  });

  it('succeeds on a reachable public webhook', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser } as never);

    const res = await notificationService.testChannel('u1', 'webhook');

    expect(res).toEqual({ success: true });
  });
});
