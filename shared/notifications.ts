// Notification contracts shared by api/ and web/. Import only from shared/.

/**
 * #469/#338: the categories that have a real sender, in display order.
 * A member's stored list (`User.notifCategories`) holds the ones they receive.
 */
export const NOTIFICATION_CATEGORIES = ['peak', 'temperature', 'security', 'wishlist', 'backup'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/**
 * An empty stored list means "every category" — the default of a new
 * account. The profile screen saves `[]` again once every category is ticked.
 */
export function isNotificationCategoryEnabled(stored: readonly string[], category: NotificationCategory): boolean {
  return stored.length === 0 || stored.includes(category);
}

/**
 * #575: local hour (instance time zone) of the daily run that sends the
 * automatic alerts — peak maturity and humidor drift. Shown under the
 * quiet-hours setting.
 */
export const DAILY_ALERTS_HOUR = 10;
