import { prisma } from '../lib/prisma';
import { emailService } from './email.service';
import { systemConfigService } from './system-config.service';
import { htmlToPlainText } from '../lib/html';
import { normalizeGotifyUrl } from '../lib/gotify-url';

export type NotificationCategory =
  | 'peak'
  | 'temperature'
  | 'consumption'
  | 'shares'
  | 'permissions'
  | 'new_users'
  | 'security'
  | 'wishlist'
  | 'backup';

interface NotificationPayload {
  userId: string;
  category: NotificationCategory;
  subject: string;
  htmlBody: string;
  /**
   * Skip the user's quiet-hours window entirely (FEAT-29). Reserved for the
   * `security` category: a compromised account must not wait for morning.
   */
  bypassQuietHours?: boolean;
  /**
   * Deliver the email channel to this address instead of the account's
   * current one. Reserved for security events whose whole point is to warn
   * the *previous* recipient (e.g. an email change, ISSUE_042). The in-app /
   * webhook channels are unaffected.
   */
  emailOverride?: string;
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
    if (!payload.bypassQuietHours && user.notifQuietStart != null && user.notifQuietEnd != null) {
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
        await emailService.send({ to: payload.emailOverride ?? user.email, subject: payload.subject, html: payload.htmlBody });
      } catch (error) {
        // An email failure must not block the other channels, but a notification
        // that never left still has to leave a trace (ISSUE_063).
        console.error('[notification] email delivery failed:', error);
      }
    }

    // Webhook (Gotify) channel
    if (user.notifWebhook && user.webhookUrl) {
      try {
        await fetch(normalizeGotifyUrl(user.webhookUrl), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: payload.subject, message: htmlToPlainText(payload.htmlBody) }),
          signal: AbortSignal.timeout(5000),
        });
      } catch (error) {
        // Same contract as the email channel above: swallowed, never silent.
        console.error('[notification] webhook delivery failed:', error);
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
        const res = await fetch(normalizeGotifyUrl(user.webhookUrl), {
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
