import { Injectable } from '@nestjs/common';
import type {
  CreateKitchenHolidayInput,
  CutoffPreviewDay,
  KitchenHolidayDto,
  PlatformSettingsDto,
  UpdateSettingsInput,
} from '@fernleaf/shared';
import { ClockService } from '../common/clock/clock.service.js';
import { dbDateToIso, isoDateToDb } from '../common/dates.js';
import { ConflictError, NotFoundError } from '../common/errors/domain-error.js';
import { isUniqueViolation } from '../common/errors/prisma-errors.js';
import {
  addDays,
  cutoffInstant,
  isWorkingDay,
  weekdayOf,
  type CutoffRule,
  type WorkCalendar,
} from '../domain/calendar.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** What the calendar and cut-off code needs, loaded from the settings in one go. */
export interface KitchenRules {
  calendar: WorkCalendar;
  cutoff: CutoffRule;
  zone: string;
}

/** Platform-wide settings (spec 4.10): one database row plus the kitchen's holidays. */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  async getSettings(): Promise<PlatformSettingsDto> {
    const [settings, holidays] = await Promise.all([
      this.prisma.platformSettings.findUniqueOrThrow({ where: { id: 1 } }),
      this.prisma.kitchenHoliday.findMany({ orderBy: { date: 'asc' } }),
    ]);
    const { id: _id, updatedAt, ...values } = settings;
    return {
      ...values,
      kitchenTimeZone: this.clock.kitchenTimeZone,
      kitchenHolidays: holidays.map(toHolidayDto),
      updatedAt: updatedAt.toISOString(),
    };
  }

  async updateSettings(input: UpdateSettingsInput): Promise<PlatformSettingsDto> {
    await this.prisma.platformSettings.update({ where: { id: 1 }, data: input });
    return this.getSettings();
  }

  async addKitchenHoliday(input: CreateKitchenHolidayInput): Promise<KitchenHolidayDto> {
    try {
      const holiday = await this.prisma.kitchenHoliday.create({
        data: { date: isoDateToDb(input.date), name: input.name },
      });
      return toHolidayDto(holiday);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(`There is already a kitchen holiday on ${input.date}.`);
      }
      throw error;
    }
  }

  async removeKitchenHoliday(id: string): Promise<void> {
    const { count } = await this.prisma.kitchenHoliday.deleteMany({ where: { id } });
    if (count === 0) throw new NotFoundError('Kitchen holiday');
  }

  /** The kitchen's calendar and cut-off rule, as used by every cut-off calculation. */
  async getKitchenRules(): Promise<KitchenRules> {
    const [settings, holidays] = await Promise.all([
      this.prisma.platformSettings.findUniqueOrThrow({ where: { id: 1 } }),
      this.prisma.kitchenHoliday.findMany({ select: { date: true } }),
    ]);
    return {
      calendar: {
        workingDays: settings.kitchenWorkingDays,
        holidays: new Set(holidays.map((h) => dbDateToIso(h.date))),
      },
      cutoff: {
        cutoffTimeMinutes: settings.cutoffTimeMinutes,
        cutoffDaysBefore: settings.cutoffDaysBefore,
      },
      zone: this.clock.kitchenTimeZone,
    };
  }

  /** The next `days` delivery dates from today: is the kitchen open, and when do orders lock? */
  async cutoffPreview(days: number): Promise<CutoffPreviewDay[]> {
    const rules = await this.getKitchenRules();
    const holidayNames = new Map(
      (await this.prisma.kitchenHoliday.findMany()).map((h) => [dbDateToIso(h.date), h.name]),
    );
    const today = this.clock.kitchenToday();
    const now = this.clock.now();

    return Array.from({ length: days }, (_, offset) => {
      const date = addDays(today, offset);
      const kitchenOpen = isWorkingDay(date, rules.calendar);
      const cutoffAt = kitchenOpen
        ? cutoffInstant(date, rules.calendar, rules.cutoff, rules.zone)
        : null;
      return {
        date,
        weekday: weekdayOf(date),
        kitchenOpen,
        holidayName: holidayNames.get(date) ?? null,
        cutoffAt: cutoffAt?.toISOString() ?? null,
        locked: cutoffAt ? now.getTime() >= cutoffAt.getTime() : null,
      };
    });
  }
}

function toHolidayDto(holiday: { id: string; date: Date; name: string }): KitchenHolidayDto {
  return { id: holiday.id, date: dbDateToIso(holiday.date), name: holiday.name };
}
