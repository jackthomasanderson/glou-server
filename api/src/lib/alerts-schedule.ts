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
 * Whether today's alert run has already been due. Before that hour, a
 * startup leaves the peak recompute to the scheduled run: a container
 * restarted at night (an image update) would otherwise send the 1 January
 * peak alerts in everyone's quiet hours, where they are lost.
 */
export function isDailyAlertsSlotPassed(now: Date, timeZone?: string): boolean {
  return hourInTimeZone(now, timeZone) >= DAILY_ALERTS_HOUR;
}
