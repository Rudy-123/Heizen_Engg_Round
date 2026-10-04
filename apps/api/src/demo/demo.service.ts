import { Injectable, Logger } from '@nestjs/common';
import type { MenuDishDto, Permission } from '@fernleaf/shared';
import { DateTime } from 'luxon';
import { BillingService } from '../billing/billing.service.js';
import { ClockService } from '../common/clock/clock.service.js';
import { dbDateToIso, isoDateToDb } from '../common/dates.js';
import {
  addDays,
  cutoffInstant,
  isWorkingDay,
  weekdayOf,
  type IsoDate,
} from '../domain/calendar.js';
import { DispatchService } from '../dispatch/dispatch.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { KitchenService } from '../kitchen/kitchen.service.js';
import { MenuService } from '../menu/menu.service.js';
import { CutoffService } from '../orders/cutoff.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService, type KitchenRules } from '../settings/settings.service.js';
import {
  between,
  planDeliveryNote,
  planDrop,
  planFate,
  planKitchenReady,
  planLines,
  planNote,
  planUnit,
  randomFor,
  type Random,
} from './demo-plan.js';

/** The staff member the simulation acts as. It has no password, so nobody can sign in as it. */
const SIMULATOR = {
  roleKey: 'demo-simulator',
  roleName: 'Demo simulator',
  email: 'demo.simulator@fernleaf.example',
  name: 'Demo simulator',
  permissions: [
    'ORDERS_READ',
    'ORDERS_WRITE',
    'ORDERS_OVERRIDE',
    'KITCHEN_READ',
    'KITCHEN_WORK',
    'DISPATCH_READ',
    'DISPATCH_MANAGE',
    'DELIVERIES_ANY',
    'BILLING_READ',
    'BILLING_WRITE',
  ] satisfies Permission[],
};

/** Today's drops for this reviewer account are taken out for delivery but left for them to deliver. */
const REVIEWER_DRIVER_EMAIL = 'driver@test.com';

const MINUTE = 60_000;

export interface DemoWindow {
  /** Days of history to keep filled, before today. */
  pastDays: number;
  /** Days ahead to keep filled, after today. */
  futureDays: number;
  /** Scales how many employees order each day (1 = a normal day). */
  volume?: number;
}

export const DEFAULT_WINDOW: DemoWindow = { pastDays: 14, futureDays: 5 };

export interface DemoReport {
  ordersCreated: number;
  cutoffsRun: number;
  unitSteps: number;
  dropSteps: number;
  invoicesIssued: number;
  invoicesPaid: number;
}

interface Simulator {
  id: string;
  name: string;
  permissions: Permission[];
}

/**
 * Keeps the demo kitchen alive (spec: "today will be whichever day we review").
 *
 * Every run fills the window around today with orders, then moves them along with the clock:
 * past days end delivered and invoiced, today's kitchen and deliveries are wherever they
 * should be at this moment, and the next days hold placed orders and drafts.
 *
 * Honest by construction:
 * - every change goes through the real services (orders, cut-off, kitchen, dispatch, billing),
 *   so every business rule applies. Past days are replayed with the clock set to the moment
 *   each step happens, so timelines and on-time figures look like a real day;
 * - it never deletes anything, and never touches an order a person has acted on: only orders
 *   the simulator created, with no event by anyone else, are moved along;
 * - running it again finds nothing new to do (choices are seeded by date and order id).
 */
@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly settings: SettingsService,
    private readonly menu: MenuService,
    private readonly orders: OrdersService,
    private readonly cutoffs: CutoffService,
    private readonly kitchen: KitchenService,
    private readonly dispatch: DispatchService,
    private readonly billing: BillingService,
  ) {}

  async run(window: DemoWindow = DEFAULT_WINDOW): Promise<DemoReport> {
    const report: DemoReport = {
      ordersCreated: 0,
      cutoffsRun: 0,
      unitSteps: 0,
      dropSteps: 0,
      invoicesIssued: 0,
      invoicesPaid: 0,
    };
    const actor = await this.simulator();
    const rules = await this.settings.getKitchenRules();
    const today = this.clock.kitchenToday();
    const dates = Array.from({ length: window.pastDays + window.futureDays + 1 }, (_, i) =>
      addDays(today, i - window.pastDays),
    );

    for (const [index, date] of dates.entries()) {
      if (!(await this.hasOrders(date, actor))) {
        // Orders trickle in until the cut-off: days far ahead have fewer so far.
        const ahead = index - window.pastDays;
        const volume = (window.volume ?? 1) * (ahead >= 4 ? 0.5 : 1);
        report.ordersCreated += await this.createDay(date, actor, rules, volume);
      }
    }
    for (const date of dates) {
      if (await this.runCutoff(date, rules)) report.cutoffsRun += 1;
    }
    for (const date of dates.filter((d) => d <= today)) {
      // Past days play out to the end; today only up to now.
      const until = date < today ? this.endOf(date) : this.clock.now();
      await this.advanceDay(date, until, actor, date === today, report);
    }
    await this.bill(
      dates.filter((d) => d <= today),
      actor,
      report,
    );
    return report;
  }

  // ---------------------------------------------------------------------------------------
  // Orders for a day
  // ---------------------------------------------------------------------------------------

  private async hasOrders(date: IsoDate, actor: Simulator): Promise<boolean> {
    return (
      (await this.prisma.order.count({
        where: { deliveryDate: isoDateToDb(date), createdById: actor.id },
      })) > 0
    );
  }

  /**
   * A day's orders, as if employees had asked for them over the days before: about a third
   * of each open company's staff order. Each is created at a moment
   * before the cut-off (and never in the future), through the same rules as the order form.
   */
  private async createDay(
    date: IsoDate,
    actor: Simulator,
    rules: KitchenRules,
    volume: number,
  ): Promise<number> {
    if (!isWorkingDay(date, rules.calendar)) return 0;
    const random = randomFor(`demo:${date}`);
    const cutoffAt = cutoffInstant(date, rules.calendar, rules.cutoff, rules.zone);
    const now = this.clock.now();
    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        holidays: true,
        addresses: { where: { isActive: true }, orderBy: { label: 'asc' } },
        employees: {
          where: { isActive: true },
          orderBy: { email: 'asc' },
          include: { allergies: true },
        },
      },
    });

    let created = 0;
    const createAll = async () => {
      for (const company of companies) {
        const calendar = {
          workingDays: company.workingDays,
          holidays: new Set(company.holidays.map((h) => dbDateToIso(h.date))),
        };
        if (!isWorkingDay(date, calendar)) continue;
        const share = (0.3 + random() * 0.15) * volume;
        const people = company.employees.filter(() => random() < share);
        const first = people[0];
        if (!first) continue;
        // Everyone at one company sees the same dishes at the same prices.
        const menu = await this.menu.menuForEmployee(first.id);
        const dishes = uniqueDishes(menu.sections.flatMap((section) => section.dishes));

        for (const employee of people) {
          const lines = planLines(
            random,
            dishes,
            new Set(employee.allergies.map((a) => a.allergenId)),
          );
          if (lines.length === 0) continue;
          const fate = planFate(random, cutoffAt > now);
          const placedAt = this.placedAt(random, date, cutoffAt, now);
          const deliveryTimeMinutes =
            employee.canChangeDeliveryTime && random() < 0.35
              ? pickTime(
                  random,
                  company.defaultDeliveryTimeMinutes,
                  company.workingDays.length === 7,
                )
              : null;
          const otherAddress =
            employee.canChooseAddress && company.addresses.length > 1 && random() < 0.3
              ? company.addresses[between(random, 0, company.addresses.length - 1)]?.id
              : undefined;
          const notes = planNote(random);
          try {
            const order = await this.clock.runAt(placedAt, () =>
              this.orders.create(
                {
                  employeeId: employee.id,
                  deliveryDate: date,
                  deliveryTimeMinutes,
                  addressId: otherAddress ?? null,
                  packagingTypeId: null,
                  notes,
                  lines,
                  place: fate !== 'DRAFT',
                },
                actor,
              ),
            );
            created += 1;
            if (fate === 'CANCELLED') {
              // Changed their mind a few hours later - still before the cut-off.
              const cancelAt = new Date(
                Math.min(
                  placedAt.getTime() + between(random, 60, 600) * MINUTE,
                  cutoffAt.getTime() - 15 * MINUTE,
                  now.getTime() - MINUTE,
                ),
              );
              if (cancelAt > placedAt) {
                await this.clock.runAt(cancelAt, () =>
                  this.orders.cancel(order.id, order.version, 'Out of office that day.', actor),
                );
              }
            }
          } catch (error) {
            this.logger.warn(`Skipped an order for ${employee.email} on ${date}: ${String(error)}`);
          }
        }
      }
    };
    if (cutoffAt > now) {
      await createAll();
    } else {
      // A past cut-off: hold that date's cut-off lock while its orders are written, so the
      // real cut-off scheduler can't confirm them halfway through (with today's timestamps).
      await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cutoff:${date}`}))`;
          await createAll();
        },
        { maxWait: 60_000, timeout: 900_000 },
      );
      await this.runCutoff(date, rules);
    }
    return created;
  }

  /** A weekday working hour, two to five days before delivery, before the cut-off and now. */
  private placedAt(random: Random, date: IsoDate, cutoffAt: Date, now: Date): Date {
    const day = DateTime.fromISO(addDays(date, -between(random, 2, 5)), {
      zone: this.clock.kitchenTimeZone,
    });
    const at = day.set({ hour: between(random, 9, 18), minute: between(random, 0, 59) }).toJSDate();
    const latest = Math.min(cutoffAt.getTime() - 30 * MINUTE, now.getTime() - 5 * MINUTE);
    return new Date(Math.min(at.getTime(), latest - between(random, 0, 240) * MINUTE));
  }

  /**
   * Cut-off processing for a date whose cut-off has passed and still has drafts or placed
   * orders - run at the cut-off moment itself (plus two minutes), as the scheduler would have.
   */
  private async runCutoff(date: IsoDate, rules: KitchenRules): Promise<boolean> {
    if (!isWorkingDay(date, rules.calendar)) return false;
    const cutoffAt = cutoffInstant(date, rules.calendar, rules.cutoff, rules.zone);
    if (this.clock.now() < cutoffAt) return false;
    const waiting = await this.prisma.order.count({
      where: { deliveryDate: isoDateToDb(date), status: { in: ['DRAFT', 'PLACED'] } },
    });
    if (waiting === 0) return false;
    const at = new Date(Math.min(cutoffAt.getTime() + 2 * MINUTE, this.clock.now().getTime()));
    await this.clock.runAt(at, () => this.cutoffs.process(date, 'AUTOMATIC', null));
    return true;
  }

  // ---------------------------------------------------------------------------------------
  // The kitchen and the road
  // ---------------------------------------------------------------------------------------

  /**
   * Moves a day's confirmed orders along, up to `until`: units started and finished around
   * each order's planned kitchen-ready time, then each drop packed, sent out and delivered.
   * Every step runs at its own moment, and only once (a step already done is skipped).
   */
  private async advanceDay(
    date: IsoDate,
    until: Date,
    actor: Simulator,
    isToday: boolean,
    report: DemoReport,
  ): Promise<void> {
    const deliveryDate = isoDateToDb(date);
    const orders = await this.prisma.order.findMany({
      where: { deliveryDate, status: 'CONFIRMED', ...this.ownedBy(actor) },
      orderBy: { number: 'asc' },
      select: {
        id: true,
        version: true,
        confirmedAt: true,
        plannedKitchenReadyAt: true,
        lines: {
          select: {
            combinations: {
              orderBy: { id: 'asc' },
              select: { id: true, kitchenStartedAt: true, kitchenDoneAt: true },
            },
          },
        },
      },
    });

    for (const order of orders) {
      const random = randomFor(`demo:order:${order.id}`);
      // About one past order in a hundred is turned away by the kitchen before it starts.
      if (!isToday && random() < 0.01) {
        const units = order.lines.flatMap((line) => line.combinations);
        if (units.every((unit) => !unit.kitchenStartedAt)) {
          const at = DateTime.fromISO(date, { zone: this.clock.kitchenTimeZone })
            .set({ hour: 7, minute: between(random, 0, 45) })
            .toJSDate();
          await this.clock.runAt(at, () =>
            this.orders.reject(order.id, order.version, 'Ran short of an ingredient.', actor),
          );
          continue;
        }
      }
      const readyAt = planKitchenReady(random, order.plannedKitchenReadyAt);
      const steps = order.lines
        .flatMap((line) => line.combinations)
        .flatMap((unit) => {
          const plan = planUnit(random, readyAt);
          return [
            { at: plan.startAt, unit, kind: 'start' as const },
            { at: plan.doneAt, unit, kind: 'done' as const },
          ];
        })
        .sort((a, b) => a.at.getTime() - b.at.getTime());
      for (const step of steps) {
        if (step.at > until) break;
        if (step.kind === 'start' ? step.unit.kitchenStartedAt : step.unit.kitchenDoneAt) continue;
        await this.quietly(() =>
          this.clock.runAt(step.at, () =>
            step.kind === 'start'
              ? this.kitchen.start(step.unit.id, actor)
              : this.kitchen.done(step.unit.id, actor),
          ),
        );
        if (step.kind === 'done') step.unit.kitchenStartedAt ??= step.at;
        report.unitSteps += 1;
      }
    }

    await this.advanceDrops(date, until, actor, isToday, report);
  }

  private async advanceDrops(
    date: IsoDate,
    until: Date,
    actor: Simulator,
    isToday: boolean,
    report: DemoReport,
  ): Promise<void> {
    const drops = await this.prisma.drop.findMany({
      where: { deliveryDate: isoDateToDb(date) },
      orderBy: { deliveryAt: 'asc' },
      include: {
        driver: { select: { email: true } },
        orders: {
          where: { status: { in: ['CONFIRMED', 'DELIVERED'] } },
          select: {
            id: true,
            createdById: true,
            kitchenReadyAt: true,
            plannedDispatchReadyAt: true,
            _count: { select: { events: { where: this.byPeople(actor) } } },
          },
        },
      },
    });

    for (const drop of drops) {
      // Only drops made entirely of the simulator's untouched orders.
      if (drop.orders.length === 0) continue;
      if (drop.orders.some((o) => o.createdById !== actor.id || o._count.events > 0)) continue;
      if (drop.deliveredAt || drop.orders.some((o) => !o.kitchenReadyAt)) continue;

      const random = randomFor(`demo:drop:${drop.id}`);
      const plan = planDrop(random, {
        kitchenReadyAt: new Date(
          Math.max(...drop.orders.map((o) => o.kitchenReadyAt?.getTime() ?? 0)),
        ),
        plannedDispatchReadyAt: new Date(
          Math.min(...drop.orders.map((o) => o.plannedDispatchReadyAt.getTime())),
        ),
        deliveryAt: drop.deliveryAt,
      });
      const step = async (at: Date, work: () => Promise<unknown>) => {
        if (at > until) return false;
        await this.quietly(() => this.clock.runAt(at, work));
        report.dropSteps += 1;
        return true;
      };

      if (!drop.dispatchReadyAt) {
        if (!(await step(plan.readyAt, () => this.dispatch.markDispatchReady(drop.id, actor)))) {
          continue;
        }
      }
      if (!drop.outForDeliveryAt) {
        if (!drop.driverId) continue; // dispatch hasn't picked anyone: left as an exception
        if (!(await step(plan.outAt, () => this.dispatch.markOutForDelivery(drop.id, actor)))) {
          continue;
        }
      }
      // Today, the reviewer driver's drops wait for the reviewer to deliver them.
      if (isToday && drop.driver?.email === REVIEWER_DRIVER_EMAIL) continue;
      await step(plan.deliveredAt, () =>
        this.dispatch.deliver(
          drop.id,
          { note: planDeliveryNote(random), photo: null },
          actor,
          null,
        ),
      );
    }
  }

  // ---------------------------------------------------------------------------------------
  // Billing
  // ---------------------------------------------------------------------------------------

  /**
   * Weekly invoicing: every Monday at 11:00, each company is invoiced for the simulator's
   * billable orders delivered before that Monday; each invoice is paid 5 to 13 days later.
   * The current week stays uninvoiced and recent invoices unpaid - as in any real business.
   */
  private async bill(days: IsoDate[], actor: Simulator, report: DemoReport): Promise<void> {
    const now = this.clock.now();
    const zone = this.clock.kitchenTimeZone;
    for (const monday of days.filter((date) => weekdayOf(date) === 1)) {
      const issueAt = DateTime.fromISO(monday, { zone }).set({ hour: 11 }).toJSDate();
      if (issueAt > now) continue;
      const due = await this.prisma.order.groupBy({
        by: ['companyId'],
        where: {
          invoiceId: null,
          status: { in: ['CONFIRMED', 'DELIVERED'] },
          deliveryDate: { lt: isoDateToDb(monday), gte: isoDateToDb(days[0] ?? monday) },
          ...this.ownedBy(actor),
        },
      });
      for (const { companyId } of due) {
        // Never sweep a credit someone recorded into a simulated invoice.
        const theirCredits = await this.prisma.billingAdjustment.count({
          where: { companyId, invoiceId: null, NOT: { createdById: actor.id } },
        });
        if (theirCredits > 0) continue;
        const orders = await this.prisma.order.findMany({
          where: {
            companyId,
            invoiceId: null,
            status: { in: ['CONFIRMED', 'DELIVERED'] },
            deliveryDate: { lt: isoDateToDb(monday), gte: isoDateToDb(days[0] ?? monday) },
            ...this.ownedBy(actor),
          },
          select: { id: true },
        });
        await this.quietly(() =>
          this.clock.runAt(issueAt, () =>
            this.billing.createInvoice({ companyId, orderIds: orders.map((o) => o.id) }, actor),
          ),
        );
        report.invoicesIssued += 1;
      }
    }

    const unpaid = await this.prisma.invoice.findMany({
      where: { status: 'ISSUED', issuedById: actor.id },
      select: { id: true, issuedAt: true },
    });
    for (const invoice of unpaid) {
      const paidAt = DateTime.fromJSDate(invoice.issuedAt, { zone })
        .plus({ days: between(randomFor(`demo:invoice:${invoice.id}`), 5, 13) })
        .set({ hour: 15, minute: 0 })
        .toJSDate();
      if (paidAt > now) continue;
      await this.quietly(() =>
        this.clock.runAt(paidAt, () => this.billing.markPaid(invoice.id, actor)),
      );
      report.invoicesPaid += 1;
    }
  }

  // ---------------------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------------------

  /** The simulator's staff account and role, created on first use. */
  private async simulator(): Promise<Simulator> {
    const role = await this.prisma.role.upsert({
      where: { key: SIMULATOR.roleKey },
      create: {
        key: SIMULATOR.roleKey,
        name: SIMULATOR.roleName,
        description: 'Keeps the demo data moving. No one can sign in with it.',
        homeDashboard: 'ADMIN',
        permissions: SIMULATOR.permissions,
      },
      update: {},
    });
    const user = await this.prisma.user.upsert({
      where: { email: SIMULATOR.email },
      create: { email: SIMULATOR.email, name: SIMULATOR.name, roleId: role.id, passwordHash: null },
      update: {},
    });
    return { id: user.id, name: user.name, permissions: role.permissions };
  }

  /** Orders the simulator created and nobody else has acted on since. */
  private ownedBy(actor: Simulator): Prisma.OrderWhereInput {
    return { createdById: actor.id, events: { none: this.byPeople(actor) } };
  }

  /** Events by a person (not the simulator, not the system). */
  private byPeople(actor: Simulator): Prisma.OrderEventWhereInput {
    return { AND: [{ actorId: { not: null } }, { actorId: { not: actor.id } }] };
  }

  private endOf(date: IsoDate): Date {
    return DateTime.fromISO(date, { zone: this.clock.kitchenTimeZone }).endOf('day').toJSDate();
  }

  /** A step someone else already took (409) or that no longer applies (422) is fine to skip. */
  private async quietly(work: () => Promise<unknown>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.debug(`Demo step skipped: ${String(error)}`);
    }
  }
}

function uniqueDishes(dishes: MenuDishDto[]): MenuDishDto[] {
  const seen = new Map<string, MenuDishDto>();
  for (const dish of dishes) if (!seen.has(dish.dishId)) seen.set(dish.dishId, dish);
  return [...seen.values()];
}

/** Another delivery time on the 15-minute grid: a bit earlier or later, or (24/7 sites) dinner. */
function pickTime(random: Random, usual: number, roundTheClock: boolean): number {
  if (roundTheClock && random() < 0.4) return between(random, 0, 4) * 15 + 1140; // 19:00-20:00
  return Math.min(1260, Math.max(420, usual + between(random, -2, 4) * 15));
}
