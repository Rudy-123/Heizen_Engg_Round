import { Injectable } from '@nestjs/common';
import type {
  KitchenBoardDto,
  KitchenOrderDto,
  KitchenStationSummaryDto,
  KitchenUnitDto,
  ProductionLineDto,
} from '@fernleaf/shared';
import { DateTime } from 'luxon';
import { ClockService } from '../common/clock/clock.service.js';
import { isoDateToDb } from '../common/dates.js';
import { BusinessRuleError, ConflictError, NotFoundError } from '../common/errors/domain-error.js';
import type { IsoDate } from '../domain/calendar.js';
import { kitchenRisk } from '../domain/operations.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const allergenSelect = { select: { allergen: { select: { id: true, name: true } } } } as const;

const unitSelect = {
  id: true,
  quantity: true,
  kitchenStartedAt: true,
  kitchenDoneAt: true,
  kitchenStartedBy: { select: { name: true } },
  kitchenDoneBy: { select: { name: true } },
  options: {
    orderBy: { id: 'asc' },
    select: {
      optionName: true,
      portionName: true,
      option: { select: { allergens: allergenSelect } },
    },
  },
} satisfies Prisma.OrderLineCombinationSelect;

/** Only what the kitchen needs: no prices anywhere (spec 2: kitchen sees no money). */
const boardOrderSelect = {
  id: true,
  number: true,
  status: true,
  deliveryTimeMinutes: true,
  packagingName: true,
  notes: true,
  plannedKitchenReadyAt: true,
  plannedDispatchReadyAt: true,
  kitchenStartedAt: true,
  kitchenReadyAt: true,
  company: { select: { name: true } },
  employee: {
    select: { firstName: true, lastName: true, allergies: { select: { allergenId: true } } },
  },
  lines: {
    orderBy: { sortOrder: 'asc' },
    select: {
      dishName: true,
      dish: { select: { kitchenStationId: true, allergens: allergenSelect } },
      combinations: { orderBy: { id: 'asc' }, select: unitSelect },
    },
  },
} satisfies Prisma.OrderSelect;

type BoardOrder = Prisma.OrderGetPayload<{ select: typeof boardOrderSelect }>;
type Unit = Prisma.OrderLineCombinationGetPayload<{ select: typeof unitSelect }>;

interface Actor {
  id: string;
  name: string;
}

/**
 * Kitchen board (spec 4.7). A prep unit is one combination on an order line.
 *
 * Every unit action locks its order's row first, so actions on one order happen one at a
 * time: two people pressing "done" on the same unit can't both succeed, and when the last
 * two units finish together "kitchen ready" is still set exactly once.
 */
@Injectable()
export class KitchenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  async board(date: IsoDate): Promise<KitchenBoardDto> {
    const deliveryDate = isoDateToDb(date);
    const [settings, stations, orders, awaitingOrders, awaitingMeals] = await Promise.all([
      this.prisma.platformSettings.findUniqueOrThrow({
        where: { id: 1 },
        select: { atRiskMinutes: true },
      }),
      this.prisma.kitchenStation.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, isActive: true },
      }),
      this.prisma.order.findMany({
        where: { deliveryDate, status: { in: ['CONFIRMED', 'DELIVERED'] } },
        orderBy: [{ plannedKitchenReadyAt: 'asc' }, { number: 'asc' }],
        select: boardOrderSelect,
      }),
      this.prisma.order.count({ where: { deliveryDate, status: 'PLACED' } }),
      this.prisma.orderLine.aggregate({
        where: { order: { deliveryDate, status: 'PLACED' } },
        _sum: { quantity: true },
      }),
    ]);
    const now = this.clock.now();
    const cards = orders.map((order) => toKitchenOrder(order, now, settings.atRiskMinutes));
    const units = cards.flatMap((card) => card.units);

    const summaries: KitchenStationSummaryDto[] = [
      ...stations.map((station) => ({ id: station.id, name: station.name })),
      { id: null, name: 'Unassigned' },
    ]
      .map((station) => summarise(station, units))
      // Switched-off stations and "Unassigned" only appear when they have work today.
      .filter(
        (summary) =>
          summary.units > 0 ||
          (summary.id !== null && stations.find((s) => s.id === summary.id)?.isActive),
      );

    return {
      date,
      now: now.toISOString(),
      atRiskMinutes: settings.atRiskMinutes,
      stations: summaries,
      orders: cards,
      production: production(units),
      awaitingConfirmation: {
        orders: awaitingOrders,
        meals: awaitingMeals._sum.quantity ?? 0,
      },
    };
  }

  /** Mark a unit started. Starting twice is refused, with who started it and when. */
  async start(unitId: string, actor: Actor): Promise<KitchenOrderDto> {
    return this.unitAction(unitId, actor, 'start');
  }

  /** Mark a unit done. A unit that was never started gets its start recorded too. */
  async done(unitId: string, actor: Actor): Promise<KitchenOrderDto> {
    return this.unitAction(unitId, actor, 'done');
  }

  /** Spec 4.7: an admin finishes every remaining unit of an order in one go. */
  async forceComplete(orderId: string, actor: Actor): Promise<KitchenOrderDto> {
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      if (order.kitchenReadyAt) {
        throw new ConflictError('This order is already kitchen ready.', 'ALREADY_KITCHEN_READY');
      }
      const open = await tx.orderLineCombination.count({
        where: { line: { orderId }, kitchenDoneAt: null },
      });
      await tx.orderLineCombination.updateMany({
        where: { line: { orderId }, kitchenStartedAt: null },
        data: { kitchenStartedAt: now, kitchenStartedById: actor.id },
      });
      await tx.orderLineCombination.updateMany({
        where: { line: { orderId }, kitchenDoneAt: null },
        data: { kitchenDoneAt: now, kitchenDoneById: actor.id },
      });
      await tx.order.update({
        where: { id: orderId },
        data: {
          kitchenStartedAt: order.kitchenStartedAt ?? now,
          kitchenReadyAt: now,
          events: {
            create: {
              type: 'FORCE_COMPLETED',
              actorId: actor.id,
              message: `Force-completed: ${open} unfinished prep ${open === 1 ? 'unit' : 'units'} marked done. The order is kitchen ready.`,
            },
          },
        },
      });
    });
    return this.card(orderId);
  }

  private async unitAction(
    unitId: string,
    actor: Actor,
    action: 'start' | 'done',
  ): Promise<KitchenOrderDto> {
    const found = await this.prisma.orderLineCombination.findUnique({
      where: { id: unitId },
      select: { line: { select: { orderId: true } } },
    });
    if (!found) throw new NotFoundError('Prep unit');
    const orderId = found.line.orderId;
    const now = this.clock.now();

    await this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      const unit = await tx.orderLineCombination.findUniqueOrThrow({
        where: { id: unitId },
        include: {
          kitchenStartedBy: { select: { name: true } },
          kitchenDoneBy: { select: { name: true } },
          line: { select: { dishName: true } },
          options: { orderBy: { id: 'asc' } },
        },
      });
      const what = `${unit.quantity} × ${unit.line.dishName}${describeChoices(unit.options)}`;

      if (action === 'start') {
        if (unit.kitchenStartedAt) {
          throw new ConflictError(
            `Already started by ${unit.kitchenStartedBy?.name ?? 'someone'} at ${this.time(unit.kitchenStartedAt)}.`,
            'UNIT_ALREADY_STARTED',
          );
        }
        await tx.orderLineCombination.update({
          where: { id: unitId },
          data: { kitchenStartedAt: now, kitchenStartedById: actor.id },
        });
      } else {
        if (unit.kitchenDoneAt) {
          throw new ConflictError(
            `Already done by ${unit.kitchenDoneBy?.name ?? 'someone'} at ${this.time(unit.kitchenDoneAt)}.`,
            'UNIT_ALREADY_DONE',
          );
        }
        await tx.orderLineCombination.update({
          where: { id: unitId },
          data: {
            kitchenDoneAt: now,
            kitchenDoneById: actor.id,
            ...(unit.kitchenStartedAt
              ? {}
              : { kitchenStartedAt: now, kitchenStartedById: actor.id }),
          },
        });
      }

      const events: Prisma.OrderEventCreateManyOrderInput[] = [
        {
          type: action === 'start' ? 'UNIT_STARTED' : 'UNIT_DONE',
          actorId: actor.id,
          message: `${action === 'start' ? 'Started' : 'Done'}: ${what}.`,
          createdAt: now,
        },
      ];
      const data: Prisma.OrderUpdateInput = {};
      // The order's "kitchen started" is its first unit's start (spec 4.7).
      if (!order.kitchenStartedAt) {
        data.kitchenStartedAt = now;
        events.unshift({
          type: 'KITCHEN_STARTED',
          actorId: actor.id,
          message: 'The kitchen started on this order.',
          createdAt: now,
        });
      }
      // "Kitchen ready" only when every unit is done.
      if (action === 'done') {
        const open = await tx.orderLineCombination.count({
          where: { line: { orderId }, kitchenDoneAt: null },
        });
        if (open === 0) {
          data.kitchenReadyAt = now;
          events.push({
            type: 'KITCHEN_READY',
            actorId: actor.id,
            message: 'Every prep unit is done - the order is kitchen ready.',
            createdAt: now,
          });
        }
      }
      await tx.order.update({
        where: { id: orderId },
        data: { ...data, events: { createMany: { data: events } } },
      });
    });
    return this.card(orderId);
  }

  /**
   * Locks the order's row until the transaction ends (SELECT ... FOR UPDATE), so unit
   * actions on one order queue up instead of racing. Only confirmed orders can be worked on.
   */
  private async lockOrder(tx: Prisma.TransactionClient, orderId: string) {
    const rows = await tx.$queryRaw<
      { status: string; kitchenStartedAt: Date | null; kitchenReadyAt: Date | null }[]
    >`SELECT status::text AS status, "kitchenStartedAt", "kitchenReadyAt" FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const order = rows[0];
    if (!order) throw new NotFoundError('Order');
    if (order.status !== 'CONFIRMED') {
      throw new BusinessRuleError(
        'ORDER_NOT_CONFIRMED',
        order.status === 'DELIVERED'
          ? 'This order has already been delivered.'
          : 'Only confirmed orders can be worked on.',
      );
    }
    return order;
  }

  private async card(orderId: string): Promise<KitchenOrderDto> {
    const [order, settings] = await Promise.all([
      this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: boardOrderSelect }),
      this.prisma.platformSettings.findUniqueOrThrow({
        where: { id: 1 },
        select: { atRiskMinutes: true },
      }),
    ]);
    return toKitchenOrder(order, this.clock.now(), settings.atRiskMinutes);
  }

  private time(at: Date): string {
    return DateTime.fromJSDate(at, { zone: this.clock.kitchenTimeZone }).toFormat('HH:mm');
  }
}

function toKitchenOrder(order: BoardOrder, now: Date, atRiskMinutes: number): KitchenOrderDto {
  const allergies = new Set(order.employee.allergies.map((a) => a.allergenId));
  const iso = (value: Date | null) => value?.toISOString() ?? null;
  return {
    id: order.id,
    number: order.number,
    status: order.status === 'DELIVERED' ? 'DELIVERED' : 'CONFIRMED',
    employeeName: `${order.employee.firstName} ${order.employee.lastName}`,
    companyName: order.company.name,
    deliveryTimeMinutes: order.deliveryTimeMinutes,
    packagingName: order.packagingName,
    notes: order.notes,
    plannedKitchenReadyAt: order.plannedKitchenReadyAt.toISOString(),
    plannedDispatchReadyAt: order.plannedDispatchReadyAt.toISOString(),
    kitchenStartedAt: iso(order.kitchenStartedAt),
    kitchenReadyAt: iso(order.kitchenReadyAt),
    risk: kitchenRisk(order, now, atRiskMinutes),
    units: order.lines.flatMap((line) =>
      line.combinations.map((unit): KitchenUnitDto => ({
        id: unit.id,
        dishName: line.dishName,
        stationId: line.dish.kitchenStationId,
        quantity: unit.quantity,
        choices: unit.options.map(choiceLabel),
        allergyConflicts: conflicts(line.dish.allergens, unit, allergies),
        startedAt: iso(unit.kitchenStartedAt),
        startedByName: unit.kitchenStartedBy?.name ?? null,
        doneAt: iso(unit.kitchenDoneAt),
        doneByName: unit.kitchenDoneBy?.name ?? null,
      })),
    ),
  };
}

function choiceLabel(option: { optionName: string; portionName: string | null }): string {
  return option.portionName ? `${option.optionName} (${option.portionName})` : option.optionName;
}

function describeChoices(options: { optionName: string; portionName: string | null }[]): string {
  return options.length > 0 ? ` (${options.map(choiceLabel).join(', ')})` : '';
}

/** Allergens in the dish or the chosen options that the employee is allergic to. */
function conflicts(
  dishAllergens: { allergen: { id: string; name: string } }[],
  unit: Unit,
  allergies: Set<string>,
): string[] {
  const names = new Set<string>();
  for (const { allergen } of [
    ...dishAllergens,
    ...unit.options.flatMap((option) => option.option.allergens),
  ]) {
    if (allergies.has(allergen.id)) names.add(allergen.name);
  }
  return [...names].sort();
}

function summarise(
  station: { id: string | null; name: string },
  units: KitchenUnitDto[],
): KitchenStationSummaryDto {
  const mine = units.filter((unit) => unit.stationId === station.id);
  return {
    id: station.id,
    name: station.name,
    units: mine.length,
    meals: mine.reduce((sum, unit) => sum + unit.quantity, 0),
    notStarted: mine.filter((unit) => !unit.startedAt).length,
    inProgress: mine.filter((unit) => unit.startedAt && !unit.doneAt).length,
    done: mine.filter((unit) => unit.doneAt).length,
  };
}

/** What to batch-cook: meals per dish, then per combination of choices, biggest first. */
function production(units: KitchenUnitDto[]): ProductionLineDto[] {
  const dishes = new Map<string, ProductionLineDto & { byChoices: Map<string, number> }>();
  for (const unit of units) {
    const key = `${unit.stationId ?? ''}|${unit.dishName}`;
    const entry = dishes.get(key) ?? {
      dishName: unit.dishName,
      stationId: unit.stationId,
      meals: 0,
      mealsDone: 0,
      combinations: [],
      byChoices: new Map<string, number>(),
    };
    entry.meals += unit.quantity;
    if (unit.doneAt) entry.mealsDone += unit.quantity;
    const choices = JSON.stringify(unit.choices);
    entry.byChoices.set(choices, (entry.byChoices.get(choices) ?? 0) + unit.quantity);
    dishes.set(key, entry);
  }
  return [...dishes.values()]
    .map(({ byChoices, ...line }) => ({
      ...line,
      combinations: [...byChoices.entries()]
        .map(([choices, meals]) => ({ choices: JSON.parse(choices) as string[], meals }))
        .sort((a, b) => b.meals - a.meals),
    }))
    .sort((a, b) => b.meals - a.meals || a.dishName.localeCompare(b.dishName));
}
