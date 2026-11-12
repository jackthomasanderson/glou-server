import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));
vi.mock('../../src/services/email.service', () => ({
  emailService: { send: vi.fn().mockResolvedValue(undefined), sendTestEmail: vi.fn() },
}));
vi.mock('../../src/services/system-config.service', () => ({
  systemConfigService: { getPublic: vi.fn(), getGotify: vi.fn() },
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { prisma } from '../../src/lib/prisma';
import { emailService } from '../../src/services/email.service';
import { systemConfigService } from '../../src/services/system-config.service';
import { notificationService } from '../../src/services/notification.service';
import { hourInTimeZone } from '../../src/lib/quiet-hours';

/** #767: the instance's Gotify server, the only destination (admin URL + app token). */
const instanceGotify = { gotifyEnabled: true, gotifyUrl: 'https://1.2.3.4', gotifyToken: 'APP-TOKEN' };

const baseUser = {
  id: 'u1',
  username: 'marie',
  email: 'a@b.com',
  isActive: true,
  notifEmail: false,
  notifWebhook: true,
  notifCategories: [],
  notifQuietStart: null,
  notifQuietEnd: null,
};

/** The one Gotify call made, as [url, init]. */
const gotifyCall = () => fetchMock.mock.calls[0] as [string, RequestInit];

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  vi.mocked(systemConfigService.getPublic).mockResolvedValue({ smtpEnabled: true } as never);
  vi.mocked(systemConfigService.getGotify).mockResolvedValue({ ...instanceGotify });
});

describe('notificationService.send — delivered to the instance Gotify server (#767)', () => {
  it('posts to the instance URL with its app token as X-Gotify-Key', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser } as never);

    await notificationService.send({ userId: 'u1', category: 'security', subject: 'New sign-in', htmlBody: '<p>b</p>' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = gotifyCall();
    expect(url).toBe('https://1.2.3.4/message');
    expect(init.headers).toMatchObject({ 'X-Gotify-Key': 'APP-TOKEN' });
  });

  it('names the member the message is for, since every member shares one Gotify app', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser } as never);

    await notificationService.send({ userId: 'u1', category: 'security', subject: 'New sign-in', htmlBody: '<p>b</p>' });

    expect(JSON.parse(String(gotifyCall()[1].body))).toEqual({ title: '[marie] New sign-in', message: 'b' });
  });

  it('ignores any address a member saved before (the per-member URL is gone)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser, webhookUrl: 'https://5.6.7.8/hook' } as never);

    await notificationService.send({ userId: 'u1', category: 'security', subject: 's', htmlBody: 'b' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(gotifyCall()[0]).not.toContain('5.6.7.8');
  });

  it('makes no call when the member has not opted in', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser, notifWebhook: false } as never);

    await notificationService.send({ userId: 'u1', category: 'security', subject: 's', htmlBody: 'b' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['the channel is switched off for the instance', { gotifyEnabled: false }],
    ['the instance has no Gotify URL', { gotifyUrl: null }],
    ['the instance has no app token', { gotifyToken: null }],
  ])('makes no call, and logs no failure, when %s', async (_label, patch) => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser } as never);
    vi.mocked(systemConfigService.getGotify).mockResolvedValue({ ...instanceGotify, ...patch });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await notificationService.send({ userId: 'u1', category: 'security', subject: 's', htmlBody: 'b' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('notificationService.send — Gotify SSRF guard (ISSUE_048)', () => {
  it('refuses to call an instance URL pointed at an internal address', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser } as never);
    vi.mocked(systemConfigService.getGotify).mockResolvedValue({ ...instanceGotify, gotifyUrl: 'https://127.0.0.1:8080' });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await notificationService.send({ userId: 'u1', category: 'security', subject: 's', htmlBody: 'b' });

    expect(fetchMock).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('notificationService.send — inactive accounts (#591)', () => {
  const allChannels = { ...baseUser, notifEmail: true, notifWebhook: true };

  it('sends nothing to a deactivated or anonymised account, on any channel', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...allChannels, isActive: false } as never);

    await notificationService.send({ userId: 'u1', category: 'temperature', subject: 's', htmlBody: 'b' });

    expect(emailService.send).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('has no exception: a security message that bypasses quiet hours is not sent either', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...allChannels, isActive: false } as never);

    await notificationService.send({ userId: 'u1', category: 'security', subject: 's', htmlBody: 'b', bypassQuietHours: true });

    expect(emailService.send).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still reaches an active account on every enabled channel', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...allChannels } as never);

    await notificationService.send({ userId: 'u1', category: 'temperature', subject: 's', htmlBody: 'b' });

    expect(emailService.send).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('notificationService.send — quiet hours (#575)', () => {
  // A fixed instant; the range is built around its hour in the process's
  // time zone, the one the API reads quiet hours in.
  const now = new Date('2027-01-01T09:15:00Z');
  const hour = hourInTimeZone(now);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());

  it('drops a message that falls inside the range', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...baseUser, notifQuietStart: hour, notifQuietEnd: (hour + 1) % 24,
    } as never);

    await notificationService.send({ userId: 'u1', category: 'peak', subject: 's', htmlBody: 'b' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a message outside the range', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...baseUser, notifQuietStart: (hour + 1) % 24, notifQuietEnd: (hour + 2) % 24,
    } as never);

    await notificationService.send({ userId: 'u1', category: 'peak', subject: 's', htmlBody: 'b' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a security message bypasses the range', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...baseUser, notifQuietStart: hour, notifQuietEnd: (hour + 1) % 24,
    } as never);

    await notificationService.send({ userId: 'u1', category: 'security', subject: 's', htmlBody: 'b', bypassQuietHours: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// #981: security alerts are mandatory. Whatever an earlier session saved
// (category removed, e-mail channel off), they reach the account e-mail
// whenever the instance can send e-mail; the Gotify copy follows its switch.
describe('notificationService.send — security alerts are mandatory (#981)', () => {
  const silenced = { ...baseUser, notifEmail: false, notifWebhook: false, notifCategories: ['peak'] };

  it('e-mails the account address even with the category removed and the e-mail channel off', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...silenced } as never);

    await notificationService.send({ userId: 'u1', category: 'security', subject: 'Password changed', htmlBody: '<p>b</p>' });

    expect(emailService.send).toHaveBeenCalledWith({ to: 'a@b.com', subject: 'Password changed', html: '<p>b</p>' });
  });

  it('still warns the previous address of an e-mail change', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...silenced } as never);

    await notificationService.send({ userId: 'u1', category: 'security', subject: 's', htmlBody: 'b', emailOverride: 'old@b.com' });

    expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'old@b.com' }));
  });

  it('is not dropped by quiet hours, even when the sender forgets to say so', async () => {
    const hour = hourInTimeZone(new Date());
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...silenced, notifQuietStart: hour, notifQuietEnd: (hour + 1) % 24,
    } as never);

    await notificationService.send({ userId: 'u1', category: 'security', subject: 's', htmlBody: 'b' });

    expect(emailService.send).toHaveBeenCalledTimes(1);
  });

  it('leaves the Gotify copy to its switch', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...silenced } as never);

    await notificationService.send({ userId: 'u1', category: 'security', subject: 's', htmlBody: 'b' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends no e-mail when the instance cannot send any, and Gotify still gets its copy', async () => {
    vi.mocked(systemConfigService.getPublic).mockResolvedValue({ smtpEnabled: false } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...silenced, notifWebhook: true } as never);

    await notificationService.send({ userId: 'u1', category: 'security', subject: 's', htmlBody: 'b' });

    expect(emailService.send).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('other categories still follow the member\'s choices', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...silenced, notifCategories: [] } as never);

    await notificationService.send({ userId: 'u1', category: 'peak', subject: 's', htmlBody: 'b' });

    expect(emailService.send).not.toHaveBeenCalled();
  });
});

describe('notificationService.testChannel — the profile "Test" button (#767)', () => {
  it('sends to the instance URL with its app token, naming the member', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser } as never);

    const res = await notificationService.testChannel('u1', 'webhook');

    expect(res).toEqual({ success: true });
    const [url, init] = gotifyCall();
    expect(url).toBe('https://1.2.3.4/message');
    expect(init.headers).toMatchObject({ 'X-Gotify-Key': 'APP-TOKEN' });
    expect(JSON.parse(String(init.body)).title).toMatch(/^\[marie\] /);
  });

  it.each([
    ['the channel is switched off for the instance', { gotifyEnabled: false }],
    ['the instance has no Gotify URL', { gotifyUrl: null }],
    ['the instance has no app token', { gotifyToken: null }],
  ])('makes no call and answers GOTIFY_NOT_CONFIGURED when %s', async (_label, patch) => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser } as never);
    vi.mocked(systemConfigService.getGotify).mockResolvedValue({ ...instanceGotify, ...patch });

    const res = await notificationService.testChannel('u1', 'webhook');

    expect(res).toEqual({ success: false, error: 'GOTIFY_NOT_CONFIGURED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an internal instance URL without ever calling fetch (ISSUE_048)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser } as never);
    vi.mocked(systemConfigService.getGotify).mockResolvedValue({ ...instanceGotify, gotifyUrl: 'https://10.0.0.5' });

    const res = await notificationService.testChannel('u1', 'webhook');

    expect(res).toEqual({ success: false, error: 'INVALID_URL' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never leaks the raw HTTP status back to the caller', async () => {
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
});

// #599: the URL check only covered the first address; fetch then followed up
// to 20 redirects, a 307 even replaying the POST into the home network.
describe('Gotify redirects (#599)', () => {
  /**
   * A public server answering with a 307 to an internal address. Like the
   * real fetch: followed unless `redirect: 'manual'`, then the internal
   * target answers 200.
   */
  function redirectingToInternal() {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.redirect === 'manual'
        ? { ok: false, status: 307, headers: new Headers({ location: 'http://192.168.1.1/admin' }) }
        : { ok: true, status: 200 });
  }

  it('the Test button reports a redirect as DELIVERY_FAILED, without following it', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser } as never);
    redirectingToInternal();

    const res = await notificationService.testChannel('u1', 'webhook');

    expect(res).toEqual({ success: false, error: 'DELIVERY_FAILED' });
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: 'manual' }));
  });

  it('a notification does not follow a redirect, and logs it as a failed delivery', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser } as never);
    redirectingToInternal();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await notificationService.send({ userId: 'u1', category: 'security', subject: 's', htmlBody: 'b' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: 'manual' }));
    expect(consoleError).toHaveBeenCalledWith('[notification] Gotify delivery failed:', 'DELIVERY_FAILED');
    consoleError.mockRestore();
  });
});
