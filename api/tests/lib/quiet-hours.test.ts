import { describe, it, expect } from 'vitest';
import { hourInTimeZone, isWithinQuietHours } from '../../src/lib/quiet-hours';
import {
  ALERTS_CATCH_UP_END_HOUR, DAILY_ALERTS_CRON, DAILY_ALERTS_HOUR, isAlertsCatchUpWindow,
} from '../../src/lib/alerts-schedule';

// #575: the hours a member picks are wall-clock hours of the instance's time
// zone, not the container's UTC clock.

describe('hourInTimeZone', () => {
  it('reads the hour in the given time zone, not in UTC', () => {
    const winterNoonUtc = new Date('2027-01-15T12:00:00Z');
    expect(hourInTimeZone(winterNoonUtc, 'UTC')).toBe(12);
    expect(hourInTimeZone(winterNoonUtc, 'Europe/Paris')).toBe(13);
    expect(hourInTimeZone(winterNoonUtc, 'America/New_York')).toBe(7);
  });

  it('follows daylight saving time', () => {
    const summerNoonUtc = new Date('2027-07-15T12:00:00Z');
    expect(hourInTimeZone(summerNoonUtc, 'Europe/Paris')).toBe(14);
  });

  it('reports midnight as 0, not 24', () => {
    expect(hourInTimeZone(new Date('2027-01-15T23:00:00Z'), 'Europe/Paris')).toBe(0);
  });

  it('without a time zone, uses the process local time (the TZ variable)', () => {
    const d = new Date('2027-03-10T05:30:00Z');
    expect(hourInTimeZone(d)).toBe(d.getHours());
  });
});

describe('isWithinQuietHours in a non-UTC time zone', () => {
  // 22:00 → 07:00 quiet range, as set by a member living in Paris.
  const start = 22;
  const end = 7;

  it('03:00 UTC (04:00 in Paris) is inside the range', () => {
    expect(isWithinQuietHours(start, end, new Date('2027-01-01T03:00:00Z'), 'Europe/Paris')).toBe(true);
  });

  it('21:30 UTC is 22:30 in Paris: already quiet, while UTC says 21', () => {
    const d = new Date('2027-01-01T21:30:00Z');
    expect(isWithinQuietHours(start, end, d, 'UTC')).toBe(false);
    expect(isWithinQuietHours(start, end, d, 'Europe/Paris')).toBe(true);
  });

  it('06:30 UTC is 07:30 in Paris: quiet hours are over, while UTC says 06', () => {
    const d = new Date('2027-01-01T06:30:00Z');
    expect(isWithinQuietHours(start, end, d, 'UTC')).toBe(true);
    expect(isWithinQuietHours(start, end, d, 'Europe/Paris')).toBe(false);
  });

  it('the daily alert run, at its local hour, is outside a 22 → 7 range', () => {
    // 10:00 in Paris, winter and summer.
    expect(isWithinQuietHours(start, end, new Date('2027-01-01T09:00:00Z'), 'Europe/Paris')).toBe(false);
    expect(isWithinQuietHours(start, end, new Date('2027-07-01T08:00:00Z'), 'Europe/Paris')).toBe(false);
  });

  it('a same-day range (13 → 15) and an empty range (8 → 8)', () => {
    const d = new Date('2027-01-01T13:00:00Z'); // 14:00 in Paris
    expect(isWithinQuietHours(13, 15, d, 'Europe/Paris')).toBe(true);
    expect(isWithinQuietHours(15, 17, d, 'Europe/Paris')).toBe(false);
    expect(isWithinQuietHours(8, 8, d, 'Europe/Paris')).toBe(false);
  });
});

describe('daily alert run (#575)', () => {
  it('runs in the daytime, outside a 22:00 → 07:00 quiet range', () => {
    expect(DAILY_ALERTS_CRON).toBe(`0 ${DAILY_ALERTS_HOUR} * * *`);
    expect(DAILY_ALERTS_HOUR).toBeGreaterThanOrEqual(7);
    expect(DAILY_ALERTS_HOUR).toBeLessThan(22);
  });

  it('a startup at night leaves the alerts to the next run', () => {
    // 04:00 in Paris: a container restarted at night by an image update.
    expect(isAlertsCatchUpWindow(new Date('2027-01-01T03:00:00Z'), 'Europe/Paris')).toBe(false);
    // 22:30 in Paris: inside a 22 → 7 quiet range.
    expect(isAlertsCatchUpWindow(new Date('2027-01-01T21:30:00Z'), 'Europe/Paris')).toBe(false);
  });

  it('a startup in the daytime catches up a missed run', () => {
    // 14:00 in Paris: today's run was missed (container down), catch up now.
    expect(isAlertsCatchUpWindow(new Date('2027-01-01T13:00:00Z'), 'Europe/Paris')).toBe(true);
    // The window ends before evening quiet hours start.
    expect(ALERTS_CATCH_UP_END_HOUR).toBeLessThanOrEqual(22);
  });
});
