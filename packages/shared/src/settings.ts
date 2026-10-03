import { z } from 'zod';

const minutesOfDay = z
  .number({ message: 'Enter a time.' })
  .int()
  .min(0, { message: 'Enter a time between 00:00 and 23:59.' })
  .max(1439, { message: 'Enter a time between 00:00 and 23:59.' });

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/, { message: 'Enter domains like gmail.com.' });

/** Body of PUT /api/settings - the whole settings form is sent at once. */
export const updateSettingsSchema = z
  .object({
    kitchenWorkingDays: z
      .array(z.number().int().min(1).max(7))
      .min(1, { message: 'The kitchen needs at least one working day.' })
      .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
    cutoffTimeMinutes: minutesOfDay,
    cutoffDaysBefore: z
      .number({ message: 'Enter a number of days.' })
      .int()
      .min(0, { message: 'Use 0 or more days.' })
      .max(30, { message: 'Use at most 30 days.' }),
    autoCutoffProcessing: z.boolean(),
    atRiskMinutes: z.number({ message: 'Enter minutes.' }).int().min(0).max(240),
    onTimeGraceMinutes: z.number({ message: 'Enter minutes.' }).int().min(0).max(120),
    deliveryWindowStartMinutes: minutesOfDay,
    deliveryWindowEndMinutes: minutesOfDay,
    deliverySlotMinutes: z
      .number()
      .int()
      .refine((value) => [5, 10, 15, 20, 30, 60].includes(value), {
        message: 'Use 5, 10, 15, 20, 30 or 60 minutes.',
      }),
    publicEmailDomains: z.array(domainSchema).transform((domains) => [...new Set(domains)].sort()),
  })
  .refine((s) => s.deliveryWindowStartMinutes < s.deliveryWindowEndMinutes, {
    path: ['deliveryWindowEndMinutes'],
    message: 'The delivery window must end after it starts.',
  });

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/** Body of POST /api/settings/kitchen-holidays. */
export const createKitchenHolidaySchema = z.object({
  date: z.iso.date({ message: 'Pick a date.' }),
  name: z
    .string()
    .trim()
    .min(1, { message: 'Give the holiday a name.' })
    .max(80, { message: 'Keep the name under 80 characters.' }),
});

export type CreateKitchenHolidayInput = z.infer<typeof createKitchenHolidaySchema>;

/** Query of GET /api/settings/cutoff-preview. */
export const cutoffPreviewQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(60).default(14),
});

export interface KitchenHolidayDto {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  name: string;
}

export interface PlatformSettingsDto extends UpdateSettingsInput {
  /** Set at deploy time (KITCHEN_TIME_ZONE); shown read-only. */
  kitchenTimeZone: string;
  kitchenHolidays: KitchenHolidayDto[];
  /** ISO instant */
  updatedAt: string;
}

/** One upcoming delivery date and when its orders lock. */
export interface CutoffPreviewDay {
  /** YYYY-MM-DD */
  date: string;
  /** ISO weekday, 1 = Monday */
  weekday: number;
  kitchenOpen: boolean;
  /** Set when the kitchen is closed for a holiday. */
  holidayName: string | null;
  /** When orders for this date lock (ISO instant); null when the kitchen is closed that day. */
  cutoffAt: string | null;
  /** Has the cut-off already passed? null when the kitchen is closed that day. */
  locked: boolean | null;
}
