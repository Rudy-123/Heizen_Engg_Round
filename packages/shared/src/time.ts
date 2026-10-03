/**
 * Times of day are stored as minutes since midnight (12:30 -> 750) and calendar dates as
 * "YYYY-MM-DD" strings. Neither carries a time zone: they are always the kitchen's local
 * date and time. Instants (a moment in time) travel as ISO strings, e.g. "2026-10-05T10:30:00.000Z".
 */

/** 750 -> "12:30" */
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/** "12:30" -> 750; anything that isn't a valid HH:mm time -> null */
export function timeToMinutes(time: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** ISO weekdays as used everywhere in the app: 1 = Monday ... 7 = Sunday. */
export const WEEKDAYS = [
  { iso: 1, short: 'Mon', long: 'Monday' },
  { iso: 2, short: 'Tue', long: 'Tuesday' },
  { iso: 3, short: 'Wed', long: 'Wednesday' },
  { iso: 4, short: 'Thu', long: 'Thursday' },
  { iso: 5, short: 'Fri', long: 'Friday' },
  { iso: 6, short: 'Sat', long: 'Saturday' },
  { iso: 7, short: 'Sun', long: 'Sunday' },
] as const;
