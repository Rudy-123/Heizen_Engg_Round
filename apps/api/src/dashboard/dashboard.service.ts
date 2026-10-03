import { Injectable } from '@nestjs/common';
import type { AdminDashboardDto, CutoffWatchDto, DayDemandDto, Permission } from '@fernleaf/shared';
import { BillingService } from '../billing/billing.service.js';
import { ClockService } from '../common/clock/clock.service.js';
import { dbDateToIso, isoDateToDb } from '../common/dates.js';
import { addDays, cutoffInstant, isWorkingDay } from '../domain/calendar.js';
import { deliveredOnTime } from '../domain/operations.js';
import { PricingService } from '../pricing/pricing.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';

interface StatusMeals {
  date: Date;
  status: string;
  orders: number;
  meals: number;
}

/**
 * The admin dashboard's figures (spec 4.11). Each one is defined in the README; the comments
 * here say which orders count. Cancelled and rejected orders never count as demand.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly settings: SettingsService,
    private readonly billing: BillingService,
    private readonly pricing: PricingService,
  ) {}

  async admin(permissions: readonly Permission[]): Promise<AdminDashboardDto> {
    const rules = await this.settings.getKitchenRules();
    const now = this.clock.now();
    const today = this.clock.kitchenToday();
    const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));

    const [platform, demand, open, drops, kitchenLate] = await Promise.all([
      this.prisma.platformSettings.findUniqueOrThrow({
        where: { id: 1 },
        select: { onTimeGraceMinutes: true },
      }),
      // Orders and meals per delivery date and status, for today and the next 6 days.
      this.prisma.$queryRaw<StatusMeals[]>`
        SELECT o."deliveryDate" AS date, o.status::text AS status,
               COUNT(DISTINCT o.id)::int AS orders, COALESCE(SUM(l.quantity), 0)::int AS meals
        FROM "Order" o JOIN "OrderLine" l ON l."orderId" = o.id
        WHERE o."deliveryDate" BETWEEN ${today}::date AND ${addDays(today, 6)}::date
        GROUP BY o."deliveryDate", o.status`,
      // Every date that still has drafts or placed orders: what the cut-offs will act on.
      this.prisma.$queryRaw<StatusMeals[]>`
        SELECT o."deliveryDate" AS date, o.status::text AS status,
               COUNT(DISTINCT o.id)::int AS orders, COALESCE(SUM(l.quantity), 0)::int AS meals
        FROM "Order" o JOIN "OrderLine" l ON l."orderId" = o.id
        WHERE o.status IN ('DRAFT', 'PLACED')
        GROUP BY o."deliveryDate", o.status`,
      this.prisma.drop.findMany({
        where: { deliveryDate: isoDateToDb(today) },
        select: {
          deliveryAt: true,
          outForDeliveryAt: true,
          deliveredAt: true,
          deliveredOnTime: true,
          orders: {
            where: { status: { in: ['CONFIRMED', 'DELIVERED'] } },
            select: { plannedDispatchReadyAt: true },
          },
        },
      }),
      this.prisma.order.count({
        where: {
          deliveryDate: isoDateToDb(today),
          status: 'CONFIRMED',
          kitchenReadyAt: null,
          plannedKitchenReadyAt: { lt: now },
        },
      }),
    ]);

    const pick = (rows: StatusMeals[], date: string, ...statuses: string[]) =>
      rows
        .filter((r) => dbDateToIso(r.date) === date && statuses.includes(r.status))
        .reduce((sum, r) => ({ orders: sum.orders + r.orders, meals: sum.meals + r.meals }), {
          orders: 0,
          meals: 0,
        });

    // Drops that travel today (a drop whose orders were all cancelled doesn't count).
    const live = drops.filter((drop) => drop.orders.length > 0);
    const delivered = live.filter((drop) => drop.deliveredAt);
    const dropsLate = live.filter((drop) => {
      if (drop.deliveredAt) return false;
      const leaveBy = Math.min(...drop.orders.map((o) => o.plannedDispatchReadyAt.getTime()));
      return (
        (!drop.outForDeliveryAt && now.getTime() > leaveBy) ||
        !deliveredOnTime(now, drop.deliveryAt, platform.onTimeGraceMinutes)
      );
    }).length;

    const watch = (date: string): CutoffWatchDto => {
      const drafts = pick(open, date, 'DRAFT');
      const placed = pick(open, date, 'PLACED');
      return {
        deliveryDate: date,
        cutoffAt: cutoffInstant(date, rules.calendar, rules.cutoff, rules.zone).toISOString(),
        drafts: drafts.orders,
        draftMeals: drafts.meals,
        placed: placed.orders,
        placedMeals: placed.meals,
      };
    };
    // The next cut-off: the earliest lock time still in the future (looking three weeks ahead).
    const upcoming = Array.from({ length: 21 }, (_, i) => addDays(today, i))
      .filter((date) => isWorkingDay(date, rules.calendar))
      .map((date) => ({ date, at: cutoffInstant(date, rules.calendar, rules.cutoff, rules.zone) }))
      .filter(({ at }) => at > now)
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    // Cut-offs that passed with drafts or placed orders still waiting: processing is due.
    const overdueDates = [...new Set(open.map((r) => dbDateToIso(r.date)))]
      .filter(
        (date) =>
          isWorkingDay(date, rules.calendar) &&
          now >= cutoffInstant(date, rules.calendar, rules.cutoff, rules.zone),
      )
      .sort();

    const days: DayDemandDto[] = week.map((date) => ({
      date,
      kitchenOpen: isWorkingDay(date, rules.calendar),
      confirmedMeals: pick(demand, date, 'CONFIRMED', 'DELIVERED').meals,
      placedMeals: pick(demand, date, 'PLACED').meals,
      draftMeals: pick(demand, date, 'DRAFT').meals,
    }));
    const served = pick(demand, today, 'CONFIRMED', 'DELIVERED');

    return {
      date: today,
      now: now.toISOString(),
      today: {
        orders: served.orders,
        meals: served.meals,
        mealsDelivered: pick(demand, today, 'DELIVERED').meals,
        dropsTotal: live.length,
        dropsDelivered: delivered.length,
        dropsOnTime: delivered.filter((drop) => drop.deliveredOnTime).length,
        kitchenLate,
        dropsLate,
        placedWaiting: pick(demand, today, 'PLACED').orders,
      },
      nextCutoff: upcoming[0] ? watch(upcoming[0].date) : null,
      overdueCutoffs: overdueDates.map(watch),
      week: days,
      billing: permissions.includes('BILLING_READ') ? await this.billingFigures() : null,
      dataHealth:
        permissions.includes('PRICING_READ') && permissions.includes('COMPANIES_READ')
          ? await this.dataHealth()
          : null,
    };
  }

  private async billingFigures(): Promise<NonNullable<AdminDashboardDto['billing']>> {
    const overview = await this.billing.overview();
    const oldest = overview.companies
      .map((c) => c.oldestUnpaidIssuedAt)
      .filter((at): at is string => at !== null)
      .sort()[0];
    return {
      uninvoicedCents: overview.totals.uninvoicedCents,
      uninvoicedOrders: overview.companies.reduce((sum, c) => sum + c.uninvoicedOrders, 0),
      pendingCreditsCents: overview.totals.pendingCreditsCents,
      unpaidCents: overview.totals.unpaidCents,
      unpaidInvoices: overview.companies.reduce((sum, c) => sum + c.unpaidInvoices, 0),
      oldestUnpaidIssuedAt: oldest ?? null,
    };
  }

  /** Things that quietly break ordering: dishes with no price on a tier, half-set-up companies. */
  private async dataHealth(): Promise<NonNullable<AdminDashboardDto['dataHealth']>> {
    const [tiers, withoutOwner, withoutAddress] = await Promise.all([
      this.pricing.listTiers(),
      this.prisma.company.findMany({
        where: { isActive: true, ownerEmployeeId: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.company.findMany({
        where: { isActive: true, addresses: { none: { isActive: true } } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return {
      tiersMissingPrices: tiers
        .filter((tier) => tier.missingDishCount > 0)
        .map((tier) => ({
          id: tier.id,
          name: tier.name,
          missingDishes: tier.missingDishCount,
          companies: tier.companyCount,
        })),
      companiesWithoutOwner: withoutOwner,
      companiesWithoutAddress: withoutAddress,
    };
  }
}
