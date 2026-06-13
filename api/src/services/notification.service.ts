import { prisma } from '../lib/prisma';
import { emailService } from './email.service';
import { systemConfigService } from './system-config.service';

export type NotificationCategory =
  | 'peak'
  | 'temperature'
  | 'consumption'
  | 'shares'
  | 'permissions'
  | 'new_users';

interface NotificationPayload {
  userId: string;
  category: NotificationCategory;
  subject: string;
  htmlBody: string;
}

export const notificationService = {
  async send(payload: NotificationPayload): Promise<void> {
    const [user, policy] = await Promise.all([
      prisma.user.findUnique({ where: { id: payload.userId } }),
      systemConfigService.getPublic(),
    ]);
    if (!user) return;

    const now = new Date();
    const hour = now.getHours();

    // Check quiet hours
    if (user.notifQuietStart != null && user.notifQuietEnd != null) {
      const inQuiet = user.notifQuietStart <= user.notifQuietEnd
        ? hour >= user.notifQuietStart && hour < user.notifQuietEnd
        : hour >= user.notifQuietStart || hour < user.notifQuietEnd;
      if (inQuiet) return;
    }

    // Check category subscription
    if (user.notifCategories.length > 0 && !user.notifCategories.includes(payload.category)) {
      return;
    }

    // Email channel
    if (user.notifEmail && policy.smtpEnabled) {
      try {
        await emailService.send({ to: user.email, subject: payload.subject, html: payload.htmlBody });
      } catch {
        // Email failure must not block other channels
      }
    }

    // Webhook (Gotify) channel
    if (user.notifWebhook && user.webhookUrl) {
      try {
        await fetch(user.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: payload.subject, message: payload.htmlBody.replace(/<[^>]+>/g, '') }),
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        // Webhook failure must not propagate
      }
    }
  },

  async testChannel(userId: string, channel: 'email' | 'webhook'): Promise<{ success: boolean; error?: string }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { success: false, error: 'USER_NOT_FOUND' };

    if (channel === 'email') {
      return emailService.sendTestEmail(user.email);
    }

    if (channel === 'webhook') {
      if (!user.webhookUrl) return { success: false, error: 'NO_WEBHOOK_URL' };
      try {
        const res = await fetch(user.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Glou — Test', message: 'Notification de test Glou.' }),
          signal: AbortSignal.timeout(5000),
        });
        return res.ok ? { success: true } : { success: false, error: `HTTP ${res.status}` };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'FETCH_ERROR' };
      }
    }

    return { success: false, error: 'UNKNOWN_CHANNEL' };
  },
};
