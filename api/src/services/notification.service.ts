import { prisma } from '../lib/prisma';
import { emailService } from './email.service';
import { systemConfigService, type PublicSystemConfig } from './system-config.service';
import { htmlToPlainText } from '../lib/html';
import { gotifyService, isGotifyUsable } from './gotify.service';
import { isWithinQuietHours } from '../lib/quiet-hours';
import {
  isNotificationCategoryEnabled, type ChannelOffReason, type NotificationCategory, type NotificationChannelPolicy,
} from '../../../shared/notifications';

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
   * Gotify channels are unaffected.
   */
  emailOverride?: string;
}

/** #775: `notConfigured` wins over `off`: settings are what the admin has to fill in first. */
function offReason(isConfigured: boolean, isOn: boolean): ChannelOffReason | null {
  if (!isConfigured) return 'notConfigured';
  return isOn ? null : 'off';
}

/**
 * The channels a member can turn on: on for the instance and configured
 * (#767: Gotify needs its URL and app token; #775: email its server). An
 * administrator is also told why a channel is not available.
 */
export function channelPolicy(cfg: PublicSystemConfig, isAdmin: boolean): NotificationChannelPolicy {
  const smtpConfigured = !!cfg.smtpHost && !!cfg.smtpPort;
  const gotifyConfigured = isGotifyUsable({ gotifyEnabled: true, gotifyUrl: cfg.gotifyUrl }, !!cfg.gotifyTokenMasked);
  const policy: NotificationChannelPolicy = {
    smtpEnabled: cfg.smtpEnabled && smtpConfigured,
    gotifyEnabled: cfg.gotifyEnabled && gotifyConfigured,
    inAppEnabled: cfg.inAppEnabled,
  };
  if (isAdmin) {
    policy.offReasons = {
      email: offReason(smtpConfigured, cfg.smtpEnabled),
      gotify: offReason(gotifyConfigured, cfg.gotifyEnabled),
      inApp: offReason(true, cfg.inAppEnabled),
    };
  }
  return policy;
}

/**
 * #767: every member's Gotify messages land in the same app of the instance's
 * server; the title says who each one is for.
 */
function forMember(user: { username: string }, title: string): string {
  return `[${user.username}] ${title}`;
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

    // Gotify channel (#767): the member only opts in; every message goes to
    // the instance's server, so its title names the member it is for.
    // Off or not configured for the instance: nothing is sent, nothing logged.
    // Same contract as the email channel above: swallowed, never silent.
    if (user.notifWebhook) {
      try {
        const result = await gotifyService.post(forMember(user, payload.subject), htmlToPlainText(payload.htmlBody));
        if (!result.success && result.error !== 'GOTIFY_NOT_CONFIGURED') {
          console.error('[notification] Gotify delivery failed:', result.error);
        }
      } catch (error) {
        console.error('[notification] Gotify delivery failed:', error);
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
      return gotifyService.post(
        forMember(user, 'Glou — Test'),
        'Notification de test Glou. / Glou test notification.',
      );
    }

    return { success: false, error: 'UNKNOWN_CHANNEL' };
  },
};
