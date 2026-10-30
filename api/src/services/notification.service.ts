import { prisma } from '../lib/prisma';
import { emailService } from './email.service';
import { systemConfigService } from './system-config.service';
import { htmlToPlainText } from '../lib/html';
import { normalizeGotifyUrl } from '../lib/gotify-url';
import { assertUrlAllowed } from '../lib/ssrf';
import { isWithinQuietHours } from '../lib/quiet-hours';
import { isNotificationCategoryEnabled, type NotificationCategory } from '../../../shared/notifications';

// #469: only categories with a real emitter (consumption, shares,
// permissions and new_users never had one and were removed from the UI in #338).
export type { NotificationCategory };

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
    // #591: a deactivated or anonymised account receives nothing, whatever
    // the caller's recipient list. No exception, security included: every
    // security event needs an account that can still sign in.
    if (!user || !user.isActive) return;

    // Quiet hours drop the message (they do not delay it), in the instance's
    // time zone (#575). Senders run in the daytime for that reason.
    if (
      !payload.bypassQuietHours
      && user.notifQuietStart != null && user.notifQuietEnd != null
      && isWithinQuietHours(user.notifQuietStart, user.notifQuietEnd, new Date())
    ) {
      return;
    }

    // Check category subscription
    if (!isNotificationCategoryEnabled(user.notifCategories, payload.category)) return;

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

    // Webhook (Gotify) channel. ISSUE_048: `lib/ssrf.ts` exists precisely so an
    // authenticated member can't use a server-side fetch as a springboard into
    // the Docker network — it was written for the image-import endpoint but
    // never applied here, even though a webhook URL is exactly the same
    // shape of user-supplied address.
    if (user.notifWebhook && user.webhookUrl) {
      try {
        const url = normalizeGotifyUrl(user.webhookUrl);
        await assertUrlAllowed(url);
        await fetch(url, {
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
      const url = normalizeGotifyUrl(user.webhookUrl);
      try {
        await assertUrlAllowed(url);
      } catch {
        return { success: false, error: 'INVALID_URL' };
      }
      // ISSUE_048: the raw HTTP status / network error message is a
      // reconnaissance instrument for mapping what the server container can
      // reach internally — a stable, generic code is returned instead.
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Glou — Test', message: 'Notification de test Glou.' }),
          signal: AbortSignal.timeout(5000),
        });
        return res.ok ? { success: true } : { success: false, error: 'DELIVERY_FAILED' };
      } catch {
        return { success: false, error: 'DELIVERY_FAILED' };
      }
    }

    return { success: false, error: 'UNKNOWN_CHANNEL' };
  },
};
