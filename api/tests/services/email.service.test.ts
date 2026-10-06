import { describe, it, expect, beforeEach, vi } from 'vitest';

// #170 — every message built a new SMTP transporter, and none had a timeout: an
// unreachable mail server hung the request (or the notification loop) for minutes.

const createTransport = vi.fn();
vi.mock('nodemailer', () => ({ default: { createTransport: (...a: unknown[]) => createTransport(...a) } }));
const getSmtp = vi.fn();
vi.mock('../../src/services/system-config.service', () => ({ systemConfigService: { getSmtp: () => getSmtp() } }));

import { emailService } from '../../src/services/email.service';

const smtp = (over = {}) => ({
  smtpEnabled: true, smtpHost: 'mail', smtpPort: 587, smtpSecure: false, smtpUser: 'u', smtpPass: 'p', smtpFrom: null, ...over,
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
