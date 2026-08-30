import nodemailer from 'nodemailer';
import { systemConfigService } from './system-config.service';
import { htmlToPlainText } from '../lib/html';

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

async function createTransporter() {
  const smtp = await systemConfigService.getSmtp();
  if (!smtp.smtpEnabled || !smtp.smtpHost || !smtp.smtpPort) {
    throw new Error('SMTP_NOT_CONFIGURED');
  }

  return nodemailer.createTransport({
    host: smtp.smtpHost,
    port: smtp.smtpPort,
    secure: smtp.smtpSecure,
    auth: smtp.smtpUser && smtp.smtpPass
      ? { user: smtp.smtpUser, pass: smtp.smtpPass }
      : undefined,
  });
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
        html: '<p>Connexion SMTP validée depuis Glou. Cet email confirme que votre configuration fonctionne.</p>',
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'UNKNOWN_ERROR' };
    }
  },
};
