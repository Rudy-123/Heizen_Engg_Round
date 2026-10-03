/**
 * Display helpers. Two different things get formatted:
 * - calendar dates ("2026-10-07"): a day, not a moment - formatted as-is, never shifted by a zone;
 * - instants ("2026-10-05T10:30:00Z"): a moment - always shown in the kitchen's time zone,
 *   never the browser's, so everyone sees the kitchen's clock.
 */

const LOCALE = 'en-IN';

/** "2026-10-07" -> "Wed 7 Oct" */
export function formatIsoDate(
  date: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' },
): string {
  // Format in UTC: the date was built at UTC midnight, so no zone can move it to another day.
  return new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

/** An instant in the kitchen's zone, e.g. "Mon 5 Oct, 16:00". */
export function formatInstant(
  iso: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  },
): string {
  return new Intl.DateTimeFormat(LOCALE, { ...options, timeZone }).format(new Date(iso));
}
