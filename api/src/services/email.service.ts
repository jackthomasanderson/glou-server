import nodemailer, { type Transporter } from 'nodemailer';
import { systemConfigService } from './system-config.service';
import { htmlToPlainText } from '../lib/html';

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

async function createTransporter() {
  const smtp = await systemConfigService.getSmtp();
  if (!smtp.smtpEnabled || !smtp.smtpHost || !smtp.smtpPort) {
    throw new Error('SMTP_NOT_CONFIGURED');
  }

  // One transporter per SMTP configuration instead of a fresh connection setup
  // per message; an admin editing the settings changes the key and gets a new one.
  const key = JSON.stringify([smtp.smtpHost, smtp.smtpPort, smtp.smtpSecure, smtp.smtpUser, smtp.smtpPass]);
  if (cached?.key === key) return cached.transporter;

  const transporter = nodemailer.createTransport({
    host: smtp.smtpHost,
    port: smtp.smtpPort,
    secure: smtp.smtpSecure,
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
    try {
      const transporter = await createTransporter();
      await transporter.verify();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'UNKNOWN_ERROR' };
    }
  },

  async sendTestEmail(to: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.send({
        to,
        subject: 'Glou — Test SMTP',
        html: '<p>Connexion SMTP validée depuis Glou. Cet email confirme que votre configuration fonctionne.</p>'
          + '<p>SMTP connection validated from Glou. This email confirms your configuration is working.</p>',
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'UNKNOWN_ERROR' };
    }
  },
};
