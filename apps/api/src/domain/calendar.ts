import { DateTime } from 'luxon';

/**
 * Calendar and cut-off rules (spec 4.4, 4.6) as pure functions: no database, no clock,
 * no server time zone. Callers pass in "now" and the kitchen's zone, so the same inputs
 * always give the same answer - wherever the server runs.
 */

/** A calendar date with no time or zone, e.g. "2026-10-07". */
export type IsoDate = string;

/** Which days are open: weekly working days plus one-off closures. */
export interface WorkCalendar {
  /** ISO weekdays: 1 = Monday ... 7 = Sunday. */
  workingDays: readonly number[];
  holidays: ReadonlySet<IsoDate>;
}

export interface CutoffRule {
  /** Time of day the cut-off falls at, in minutes since midnight (16:00 = 960). */
  cutoffTimeMinutes: number;
  /** How many kitchen working days before delivery. */
  cutoffDaysBefore: number;
}

/** Safety stop: a calendar with no working days would otherwise count back forever. */
const MAX_DAYS_TO_SEARCH = 366;

function parseIsoDate(date: IsoDate): DateTime {
  const parsed = DateTime.fromISO(date, { zone: 'utc' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !parsed.isValid) {
    throw new Error(`Not a calendar date: "${date}"`);
  }
  return parsed;
}

function toIsoDate(value: DateTime): IsoDate {
  const iso = value.toISODate();
  if (iso === null) throw new Error('Invalid date');
  return iso;
}

/** ISO weekday of a calendar date (1 = Monday). Zone-free: a date is the same day everywhere. */
export function weekdayOf(date: IsoDate): number {
  return parseIsoDate(date).weekday;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return toIsoDate(parseIsoDate(date).plus({ days }));
}

export function isWorkingDay(date: IsoDate, calendar: WorkCalendar): boolean {
  return calendar.workingDays.includes(weekdayOf(date)) && !calendar.holidays.has(date);
}

/** Today's calendar date in `zone` at the instant `now`. */
export function todayIn(zone: string, now: Date): IsoDate {
  return toIsoDate(DateTime.fromJSDate(now, { zone }));
}

/** The instant at which `date` + `minutesOfDay` happens in `zone` (e.g. 16:00 IST -> 10:30 UTC). */
export function zonedInstant(date: IsoDate, minutesOfDay: number, zone: string): Date {
  const day = parseIsoDate(date);
  const local = DateTime.fromObject(
    {
      year: day.year,
      month: day.month,
      day: day.day,
      hour: Math.floor(minutesOfDay / 60),
      minute: minutesOfDay % 60,
    },
    { zone },
  );
  if (!local.isValid) throw new Error(`Invalid time ${minutesOfDay} on ${date} in ${zone}`);
  return local.toJSDate();
}

/**
 * The day orders for `deliveryDate` lock: count back `daysBefore` KITCHEN working days,
 * skipping kitchen non-working days and kitchen holidays. The delivery day itself doesn't
 * count, and company calendars play no part (spec 4.4: "The company calendar does not
 * move the cut-off").
 *
 * Example: 2 days before a Wednesday -> Tuesday (1), Monday (2) -> Monday.
 */
export function cutoffDate(
  deliveryDate: IsoDate,
  kitchen: WorkCalendar,
  daysBefore: number,
): IsoDate {
  parseIsoDate(deliveryDate); // rejects malformed dates even when daysBefore is 0
  let date = deliveryDate;
  let remaining = daysBefore;
  for (let searched = 0; remaining > 0; searched++) {
    if (searched >= MAX_DAYS_TO_SEARCH) {
      throw new Error('The kitchen calendar has no working days to count back over.');
    }
    date = addDays(date, -1);
    if (isWorkingDay(date, kitchen)) remaining--;
  }
  return date;
}

/** The exact instant orders for `deliveryDate` lock. */
export function cutoffInstant(
  deliveryDate: IsoDate,
  kitchen: WorkCalendar,
  rule: CutoffRule,
  zone: string,
): Date {
  return zonedInstant(
    cutoffDate(deliveryDate, kitchen, rule.cutoffDaysBefore),
    rule.cutoffTimeMinutes,
    zone,
  );
}

/** Has the cut-off for `deliveryDate` passed at `now`? (Locked from the cut-off instant onwards.) */
export function isPastCutoff(
  deliveryDate: IsoDate,
  now: Date,
  kitchen: WorkCalendar,
  rule: CutoffRule,
  zone: string,
): boolean {
  return now.getTime() >= cutoffInstant(deliveryDate, kitchen, rule, zone).getTime();
}

export type DeliveryDateProblem = 'IN_THE_PAST' | 'KITCHEN_CLOSED' | 'COMPANY_CLOSED';

/**
 * Why a company can't receive a delivery on `date` (empty = it can).
 * The kitchen must be open to cook, and the company must be open to receive (spec 4.4).
 * Whether the date is still before its cut-off is a separate question (isPastCutoff).
 */
export function deliveryDateProblems(
  date: IsoDate,
  context: { today: IsoDate; kitchen: WorkCalendar; company: WorkCalendar },
): DeliveryDateProblem[] {
  const problems: DeliveryDateProblem[] = [];
  // YYYY-MM-DD strings sort the same way as the dates they represent.
  if (date < context.today) problems.push('IN_THE_PAST');
  if (!isWorkingDay(date, context.kitchen)) problems.push('KITCHEN_CLOSED');
  if (!isWorkingDay(date, context.company)) problems.push('COMPANY_CLOSED');
  return problems;
}
