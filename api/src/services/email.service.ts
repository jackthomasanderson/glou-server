import nodemailer, { type Transporter } from 'nodemailer';
import { systemConfigService } from './system-config.service';
import { htmlToPlainText } from '../lib/html';
import type { SmtpSecurity } from '../../../shared/admin-config';

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// A dead SMTP server must not hang a request (or the notification loop) for
// the OS default of several minutes (#170).
const SMTP_TIMEOUT_MS = 15_000;

let cached: { key: string; transporter: Transporter } | null = null;

/**
 * #924: nodemailer's options for each mode. Without `requireTLS`, STARTTLS
 * was opportunistic: a network attacker could strip the server's offer and
 * read the SMTP password sent in clear. Now the connection fails instead.
 * NONE never tries STARTTLS, for a trusted relay on the local network.
 */
const SECURITY_OPTIONS: Record<SmtpSecurity, { secure: boolean; requireTLS?: boolean; ignoreTLS?: boolean }> = {
  TLS: { secure: true },
  STARTTLS: { secure: false, requireTLS: true },
  NONE: { secure: false, ignoreTLS: true },
};

/**
 * The reason a test failed, for the admin (#924): a TLS or STARTTLS failure
 * gets its own code, said in words by the settings screen; any other refusal
 * is the mail server's own message, as before.
 */
function testFailure(err: unknown, security: SmtpSecurity | undefined): string {
  if (!(err instanceof Error)) return 'UNKNOWN_ERROR';
  if ((err as { code?: unknown }).code === 'ETLS') {
    if (security === 'STARTTLS') return 'SMTP_STARTTLS_FAILED';
    if (security === 'TLS') return 'SMTP_TLS_FAILED';
  }
  return err.message;
}

async function createTransporter() {
  const smtp = await systemConfigService.getSmtp();
  if (!smtp.smtpEnabled || !smtp.smtpHost || !smtp.smtpPort) {
    throw new Error('SMTP_NOT_CONFIGURED');
  }

  // One transporter per SMTP configuration instead of a fresh connection setup
  // per message; an admin editing the settings changes the key and gets a new one.
  const key = JSON.stringify([smtp.smtpHost, smtp.smtpPort, smtp.smtpSecurity, smtp.smtpUser, smtp.smtpPass]);
  if (cached?.key === key) return cached.transporter;

  const transporter = nodemailer.createTransport({
    host: smtp.smtpHost,
    port: smtp.smtpPort,
    ...SECURITY_OPTIONS[smtp.smtpSecurity],
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
    auth: smtp.smtpUser && smtp.smtpPass
      ? { user: smtp.smtpUser, pass: smtp.smtpPass }
      : undefined,
  });
  cached = { key, transporter };
  return transporter;
}

export const emailService = {
  async send(opts: SendMailOptions): Promise<void> {
    const smtp = await systemConfigService.getSmtp();
    const transporter = await createTransporter();

    await transporter.sendMail({
      from: smtp.smtpFrom ?? smtp.smtpUser ?? 'Glou <noreply@glou.app>',
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text ?? htmlToPlainText(opts.html),
    });
  },

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    let security: SmtpSecurity | undefined;
    try {
      security = (await systemConfigService.getSmtp()).smtpSecurity;
      const transporter = await createTransporter();
      await transporter.verify();
      return { success: true };
    } catch (err) {
      return { success: false, error: testFailure(err, security) };
    }
  },

  async sendTestEmail(to: string): Promise<{ success: boolean; error?: string }> {
    let security: SmtpSecurity | undefined;
    try {
      security = (await systemConfigService.getSmtp()).smtpSecurity;
      await this.send({
        to,
        subject: 'Glou — Test SMTP',
        html: '<p>Connexion SMTP validée depuis Glou. Cet email confirme que votre configuration fonctionne.</p>'
          + '<p>SMTP connection validated from Glou. This email confirms your configuration is working.</p>',
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: testFailure(err, security) };
    }
  },
};
