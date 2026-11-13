import { describe, it, expect, beforeEach, vi } from 'vitest';

// #170 — every message built a new SMTP transporter, and none had a timeout: an
// unreachable mail server hung the request (or the notification loop) for minutes.

const createTransport = vi.fn();
vi.mock('nodemailer', () => ({ default: { createTransport: (...a: unknown[]) => createTransport(...a) } }));
const getSmtp = vi.fn();
vi.mock('../../src/services/system-config.service', () => ({ systemConfigService: { getSmtp: () => getSmtp() } }));

import { emailService } from '../../src/services/email.service';

const smtp = (over = {}) => ({
  smtpEnabled: true, smtpHost: 'mail', smtpPort: 587, smtpSecurity: 'STARTTLS', smtpUser: 'u', smtpPass: 'p', smtpFrom: null, ...over,
});

describe('emailService transporter (#170)', () => {
  beforeEach(() => {
    createTransport.mockReset().mockReturnValue({ sendMail: vi.fn().mockResolvedValue({}), verify: vi.fn() });
    getSmtp.mockReset();
  });

  const mail = { to: 'a@b.c', subject: 's', html: '<p>x</p>' };

  it('sets connection, greeting and socket timeouts', async () => {
    getSmtp.mockResolvedValue(smtp({ smtpHost: 'timeouts-host' }));
    await emailService.send(mail);
    const opts = createTransport.mock.calls[0][0];
    expect(opts.connectionTimeout).toBeGreaterThan(0);
    expect(opts.greetingTimeout).toBeGreaterThan(0);
    expect(opts.socketTimeout).toBeGreaterThan(0);
  });

  it('reuses the transporter while the SMTP settings do not change', async () => {
    getSmtp.mockResolvedValue(smtp({ smtpHost: 'reuse-host' }));
    await emailService.send(mail);
    await emailService.send(mail);
    expect(createTransport).toHaveBeenCalledTimes(1);
  });

  it('builds a new one when an admin changes the settings', async () => {
    getSmtp.mockResolvedValue(smtp({ smtpHost: 'change-a' }));
    await emailService.send(mail);
    getSmtp.mockResolvedValue(smtp({ smtpHost: 'change-b' }));
    await emailService.send(mail);
    expect(createTransport).toHaveBeenCalledTimes(2);
  });
});

// #924: STARTTLS was opportunistic: a network attacker could strip the offer
// and read the SMTP password. It is now required, and "no encryption" is an
// explicit third mode for a trusted local relay.
describe('emailService connection security (#924)', () => {
  beforeEach(() => {
    createTransport.mockReset().mockReturnValue({ sendMail: vi.fn().mockResolvedValue({}), verify: vi.fn() });
    getSmtp.mockReset();
  });

  const optsFor = async (smtpSecurity: string, host: string) => {
    getSmtp.mockResolvedValue(smtp({ smtpSecurity, smtpHost: host }));
    await emailService.send({ to: 'a@b.c', subject: 's', html: '<p>x</p>' });
    return createTransport.mock.calls[0][0];
  };

  it('STARTTLS requires the upgrade instead of falling back to clear text', async () => {
    const opts = await optsFor('STARTTLS', 'sec-starttls');
    expect(opts).toMatchObject({ secure: false, requireTLS: true });
    expect(opts.ignoreTLS).toBeFalsy();
  });

  it('TLS is encrypted from the first byte', async () => {
    expect(await optsFor('TLS', 'sec-tls')).toMatchObject({ secure: true });
  });

  it('no encryption never tries STARTTLS', async () => {
    const opts = await optsFor('NONE', 'sec-none');
    expect(opts).toMatchObject({ secure: false, ignoreTLS: true });
    expect(opts.requireTLS).toBeFalsy();
  });

  it('a new mode builds a new transporter', async () => {
    getSmtp.mockResolvedValue(smtp({ smtpHost: 'sec-switch', smtpSecurity: 'STARTTLS' }));
    await emailService.send({ to: 'a@b.c', subject: 's', html: '<p>x</p>' });
    getSmtp.mockResolvedValue(smtp({ smtpHost: 'sec-switch', smtpSecurity: 'NONE' }));
    await emailService.send({ to: 'a@b.c', subject: 's', html: '<p>x</p>' });
    expect(createTransport).toHaveBeenCalledTimes(2);
  });

  const tlsFailure = () => Object.assign(new Error('Error upgrading connection with STARTTLS'), { code: 'ETLS' });

  it('the test e-mail says clearly that the server refused STARTTLS', async () => {
    getSmtp.mockResolvedValue(smtp({ smtpHost: 'sec-fail-mail' }));
    createTransport.mockReturnValue({ sendMail: vi.fn().mockRejectedValue(tlsFailure()), verify: vi.fn() });
    expect(await emailService.sendTestEmail('a@b.c')).toEqual({ success: false, error: 'SMTP_STARTTLS_FAILED' });
  });

  it('so does the connection test', async () => {
    getSmtp.mockResolvedValue(smtp({ smtpHost: 'sec-fail-verify' }));
    createTransport.mockReturnValue({ sendMail: vi.fn(), verify: vi.fn().mockRejectedValue(tlsFailure()) });
    expect(await emailService.testConnection()).toEqual({ success: false, error: 'SMTP_STARTTLS_FAILED' });
  });

  it('a TLS failure in TLS mode is a TLS failure, not a STARTTLS one', async () => {
    getSmtp.mockResolvedValue(smtp({ smtpHost: 'sec-fail-tls', smtpSecurity: 'TLS' }));
    createTransport.mockReturnValue({ sendMail: vi.fn(), verify: vi.fn().mockRejectedValue(Object.assign(new Error('Error initiating TLS'), { code: 'ETLS' })) });
    expect(await emailService.testConnection()).toEqual({ success: false, error: 'SMTP_TLS_FAILED' });
  });

  it('another refusal is still shown as the server gave it', async () => {
    getSmtp.mockResolvedValue(smtp({ smtpHost: 'sec-fail-auth' }));
    createTransport.mockReturnValue({ sendMail: vi.fn(), verify: vi.fn().mockRejectedValue(Object.assign(new Error('Invalid login'), { code: 'EAUTH' })) });
    expect(await emailService.testConnection()).toEqual({ success: false, error: 'Invalid login' });
  });
});
