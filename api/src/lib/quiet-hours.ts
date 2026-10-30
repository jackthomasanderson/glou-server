/**
 * Hour of the day (0-23) of `now` in `timeZone`. Without a time zone, the
 * process's own one is used: the `TZ` variable of the container (#575).
 */
export function hourInTimeZone(now: Date, timeZone?: string): number {
  const hour = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(now);
  return Number.parseInt(hour, 10);
}

/**
 * Whether `now` falls in the member's quiet hours `[start, end)`, read in the
 * instance's time zone — the hours a member picks are wall-clock hours. A
 * range whose start is after its end spans midnight (22 → 7). `start === end`
 * is an empty range.
 */
export function isWithinQuietHours(start: number, end: number, now: Date, timeZone?: string): boolean {
  const hour = hourInTimeZone(now, timeZone);
  return start <= end
    ? hour >= start && hour < end
    : hour >= start || hour < end;
}
