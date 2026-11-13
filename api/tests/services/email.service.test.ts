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

  // Review R1: with implicit TLS, nodemailer reports a failed handshake as
  // ESOCKET, the TLS cause in originalCode (seen against a relay without TLS).
  it('a TLS failure in TLS mode (ESOCKET + an OpenSSL code) is a TLS failure, not a STARTTLS one', async () => {
    getSmtp.mockResolvedValue(smtp({ smtpHost: 'sec-fail-tls', smtpSecurity: 'TLS' }));
    const err = Object.assign(new Error('C0A7E5F1:error:0A00010B:SSL routines:ssl3_get_record:wrong version number'),
      { code: 'ESOCKET', originalCode: 'ERR_SSL_WRONG_VERSION_NUMBER' });
    createTransport.mockReturnValue({ sendMail: vi.fn(), verify: vi.fn().mockRejectedValue(err) });
    expect(await emailService.testConnection()).toEqual({ success: false, error: 'SMTP_TLS_FAILED' });
  });

  it('a plain socket failure in TLS mode (connection refused) keeps the server\'s message', async () => {
    getSmtp.mockResolvedValue(smtp({ smtpHost: 'sec-refused-tls', smtpSecurity: 'TLS' }));
    const err = Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:465'), { code: 'ESOCKET', originalCode: 'ECONNREFUSED' });
    createTransport.mockReturnValue({ sendMail: vi.fn(), verify: vi.fn().mockRejectedValue(err) });
    expect(await emailService.testConnection()).toEqual({ success: false, error: 'connect ECONNREFUSED 10.0.0.1:465' });
  });

  // Review R3: an untrusted certificate is not a server without STARTTLS, and
  // must not lead the admin to "No encryption".
  it.each([
    ['TLS', 'self-signed (ESOCKET)', Object.assign(new Error('self-signed certificate'), { code: 'ESOCKET', originalCode: 'DEPTH_ZERO_SELF_SIGNED_CERT' })],
    ['TLS', 'expired (ESOCKET)', Object.assign(new Error('certificate has expired'), { code: 'ESOCKET', originalCode: 'CERT_HAS_EXPIRED' })],
    ['TLS', 'another name (ESOCKET)', Object.assign(new Error("Hostname/IP does not match certificate's altnames"), { code: 'ESOCKET', originalCode: 'ERR_TLS_CERT_ALTNAME_INVALID' })],
    ['STARTTLS', 'self-signed (ETLS)', Object.assign(new Error('Error initiating TLS - self-signed certificate'), { code: 'ETLS' })],
    ['STARTTLS', 'untrusted issuer (ETLS)', Object.assign(new Error('Error initiating TLS - unable to verify the first certificate'), { code: 'ETLS' })],
    ['STARTTLS', 'another name (ETLS)', Object.assign(new Error("Error initiating TLS - Hostname/IP does not match certificate's altnames: Host: mail. is not in the cert's altnames"), { code: 'ETLS' })],
  ])('%s, a certificate that is %s says the certificate is not trusted', async (smtpSecurity, label, err) => {
    getSmtp.mockResolvedValue(smtp({ smtpHost: `sec-cert-${smtpSecurity}-${label}`, smtpSecurity }));
    createTransport.mockReturnValue({ sendMail: vi.fn().mockRejectedValue(err), verify: vi.fn().mockRejectedValue(err) });
    expect(await emailService.testConnection()).toEqual({ success: false, error: 'SMTP_CERTIFICATE_UNTRUSTED' });
    expect(await emailService.sendTestEmail('a@b.c')).toEqual({ success: false, error: 'SMTP_CERTIFICATE_UNTRUSTED' });
  });

  it('another refusal is still shown as the server gave it', async () => {
    getSmtp.mockResolvedValue(smtp({ smtpHost: 'sec-fail-auth' }));
    createTransport.mockReturnValue({ sendMail: vi.fn(), verify: vi.fn().mockRejectedValue(Object.assign(new Error('Invalid login'), { code: 'EAUTH' })) });
    expect(await emailService.testConnection()).toEqual({ success: false, error: 'Invalid login' });
  });
});
