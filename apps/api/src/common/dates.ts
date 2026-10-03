import type { IsoDate } from '../domain/calendar.js';

/**
 * Postgres `date` columns come back from Prisma as JS Dates at UTC midnight. These two
 * helpers convert between them and "YYYY-MM-DD" strings without ever touching the
 * server's time zone.
 */
export function isoDateToDb(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function dbDateToIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}
