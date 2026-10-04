import { Injectable } from '@nestjs/common';
import type { CutoffDayDto, CutoffOverviewDto, CutoffRunDto } from '@fernleaf/shared';
import { DateTime } from 'luxon';
import { ClockService } from '../common/clock/clock.service.js';
import { dbDateToIso, isoDateToDb } from '../common/dates.js';
import { BusinessRuleError } from '../common/errors/domain-error.js';
import { addDays, cutoffInstant, isWorkingDay, type IsoDate } from '../domain/calendar.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { joinDrop, reopenIfPacked } from './drops.js';

const runInclude = { actor: { select: { name: true } } } satisfies Prisma.CutoffRunInclude;
type RunWithActor = Prisma.CutoffRunGetPayload<{ include: typeof runInclude }>;

const EMPTY_COUNTS = {
  DRAFT: 0,
  PLACED: 0,
  CONFIRMED: 0,
  DELIVERED: 0,
  CANCELLED: 0,
  REJECTED: 0,
};

/** Spec 4.6: what happens when a delivery date's cut-off passes. */
@Injectable()
export class CutoffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Cut-off processing for one delivery date:
   *   every draft is cancelled (it was never placed);
   *   every placed order is confirmed - billable to its company from now on - and joins its
   *   drop (same company, address and delivery time; a new drop gets the company's driver).
   *
   * Safe to run twice: it only touches drafts and placed orders, so a second run finds
   * nothing to do. Two runs for the same date at the same moment (the scheduler and a person
   * pressing "Run now") take turns, through a database lock on that date.
   */
  async process(
    date: IsoDate,
    trigger: 'AUTOMATIC' | 'MANUAL',
    actorId: string | null,
  ): Promise<CutoffRunDto> {
    const rules = await this.settings.getKitchenRules();
    const cutoffAt = cutoffInstant(date, rules.calendar, rules.cutoff, rules.zone);
    const now = this.clock.now();
    if (now < cutoffAt) {
      const when = DateTime.fromJSDate(cutoffAt, { zone: rules.zone }).toFormat('ccc d LLL, HH:mm');
      throw new BusinessRuleError(
        'CUTOFF_NOT_PASSED',
        `Orders for this date only lock at ${when} - it can be processed after that.`,
      );
    }
    const how = trigger === 'MANUAL' ? 'run by hand' : 'automatic';

    const run = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cutoff:${date}`}))`;
        const deliveryDate = isoDateToDb(date);

        const drafts = await tx.order.findMany({
          where: { deliveryDate, status: 'DRAFT' },
          select: { id: true },
        });
        if (drafts.length > 0) {
          await tx.order.updateMany({
            where: { id: { in: drafts.map((d) => d.id) }, status: 'DRAFT' },
            data: {
              status: 'CANCELLED',
              cancelledAt: now,
              statusReason: 'Still a draft at the cut-off',
              version: { increment: 1 },
            },
          });
          await tx.orderEvent.createMany({
            data: drafts.map((draft) => ({
              orderId: draft.id,
              type: 'CANCELLED' as const,
              actorId,
              createdAt: now,
              message: `Cancelled at the cut-off - it was still a draft (${how}).`,
            })),
          });
        }

        const placed = await tx.order.findMany({
          where: { deliveryDate, status: 'PLACED' },
          include: { company: { select: { name: true, defaultDriverId: true } } },
        });
        // One drop per company, address and delivery time (spec 4.8).
        const drops = new Map<string, typeof placed>();
        for (const order of placed) {
          const key = `${order.companyId}|${order.addressId}|${order.deliveryTimeMinutes}`;
          drops.set(key, [...(drops.get(key) ?? []), order]);
        }
        for (const orders of drops.values()) {
          const first = orders[0];
          if (!first) continue;
          const drop = await joinDrop(tx, first, first.company.defaultDriverId);
          await reopenIfPacked(tx, drop);
          await tx.order.updateMany({
            where: { id: { in: orders.map((o) => o.id) }, status: 'PLACED' },
            data: {
              status: 'CONFIRMED',
              confirmedAt: now,
              // A late order can't join a drop that has already left; dispatch sees it unassigned.
              dropId: drop.outForDeliveryAt ? null : drop.id,
              version: { increment: 1 },
            },
          });
        }
        if (placed.length > 0) {
          await tx.orderEvent.createMany({
            data: placed.map((order) => ({
              orderId: order.id,
              type: 'CONFIRMED' as const,
              actorId,
              createdAt: now,
              message: `Confirmed at the cut-off (${how}) - now billable to ${order.company.name}.`,
            })),
          });
        }

        return tx.cutoffRun.create({
          data: {
            deliveryDate,
            trigger,
            actorId,
            cancelledCount: drafts.length,
            confirmedCount: placed.length,
            ranAt: now,
          },
          include: runInclude,
        });
      },
      { timeout: 60_000 },
    );
    return toRunDto(run);
  }

  /** Every delivery date whose cut-off has passed and still has drafts or placed orders. */
  async processDue(): Promise<CutoffRunDto[]> {
    const rules = await this.settings.getKitchenRules();
    const pending = await this.prisma.order.groupBy({
      by: ['deliveryDate'],
      where: { status: { in: ['DRAFT', 'PLACED'] } },
      orderBy: { deliveryDate: 'asc' },
    });
    const runs: CutoffRunDto[] = [];
    for (const { deliveryDate } of pending) {
      const date = dbDateToIso(deliveryDate);
      if (this.clock.now() >= cutoffInstant(date, rules.calendar, rules.cutoff, rules.zone)) {
        runs.push(await this.process(date, 'AUTOMATIC', null));
      }
    }
    return runs;
  }

  /** The Cut-offs page: the last week and the next two, with lock times, counts and runs. */
  async overview(): Promise<CutoffOverviewDto> {
    const rules = await this.settings.getKitchenRules();
    const today = this.clock.kitchenToday();
    const dates = Array.from({ length: 21 }, (_, i) => addDays(today, i - 7));
    const range = {
      gte: isoDateToDb(dates[0] ?? today),
      lte: isoDateToDb(dates.at(-1) ?? today),
    };
    const [settings, groups, runs, recent] = await Promise.all([
      this.prisma.platformSettings.findUniqueOrThrow({ where: { id: 1 } }),
      this.prisma.order.groupBy({
        by: ['deliveryDate', 'status'],
        where: { deliveryDate: range },
        _count: { _all: true },
      }),
      this.prisma.cutoffRun.findMany({
        where: { deliveryDate: range },
        include: runInclude,
        orderBy: [{ ranAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.cutoffRun.findMany({
        include: runInclude,
        orderBy: [{ ranAt: 'desc' }, { id: 'desc' }],
        take: 10,
      }),
    ]);

    const days: CutoffDayDto[] = dates.map((date) => {
      const counts = { ...EMPTY_COUNTS };
      for (const group of groups) {
        if (dbDateToIso(group.deliveryDate) === date) counts[group.status] = group._count._all;
      }
      const kitchenOpen = isWorkingDay(date, rules.calendar);
      const cutoffAt = kitchenOpen
        ? cutoffInstant(date, rules.calendar, rules.cutoff, rules.zone)
        : null;
      const isLocked = cutoffAt !== null && this.clock.now() >= cutoffAt;
      const lastRun = runs.find((run) => dbDateToIso(run.deliveryDate) === date);
      return {
        date,
        kitchenOpen,
        cutoffAt: cutoffAt?.toISOString() ?? null,
        isLocked,
        counts,
        isDue: isLocked && counts.DRAFT + counts.PLACED > 0,
        lastRun: lastRun ? toRunDto(lastRun) : null,
      };
    });
    return {
      autoProcessing: settings.autoCutoffProcessing,
      days,
      recentRuns: recent.map(toRunDto),
    };
  }
}

function toRunDto(run: RunWithActor): CutoffRunDto {
  return {
    id: run.id,
    deliveryDate: dbDateToIso(run.deliveryDate),
    trigger: run.trigger,
    actorName: run.actor?.name ?? null,
    cancelledCount: run.cancelledCount,
    confirmedCount: run.confirmedCount,
    ranAt: run.ranAt.toISOString(),
  };
}
