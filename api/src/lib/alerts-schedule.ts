import { hourInTimeZone } from './quiet-hours';
import { DAILY_ALERTS_HOUR } from '../../../shared/notifications';

// #575: the daily job that sends the automatic alerts (peak maturity, humidor
// drift) used to share the 3 a.m. maintenance slot, where any night-time
// quiet hours dropped them. Mid-morning, local time (instance `TZ`), stays
// clear of the usual night ranges (22 → 7, 23 → 9).
export { DAILY_ALERTS_HOUR };

/** node-cron expression of that daily run. */
export const DAILY_ALERTS_CRON = `0 ${DAILY_ALERTS_HOUR} * * *`;

/**
 * End (exclusive, local hour) of the daytime window in which a startup may
 * catch up a missed alert run. Evening quiet hours often start at 22:00 or
 * earlier.
 */
export const ALERTS_CATCH_UP_END_HOUR = 20;

/**
 * Whether a startup may run the peak recompute now: only in the daytime,
 * between today's alert run and the evening. Otherwise the next scheduled run
 * does it — a container restarted at night (an image update) would send the
 * 1 January peak alerts in everyone's quiet hours, where they are lost for
 * good (the new status is saved before sending).
 */
export function isAlertsCatchUpWindow(now: Date, timeZone?: string): boolean {
  const hour = hourInTimeZone(now, timeZone);
  return hour >= DAILY_ALERTS_HOUR && hour < ALERTS_CATCH_UP_END_HOUR;
}
