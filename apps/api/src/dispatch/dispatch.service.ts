import { Injectable } from '@nestjs/common';
import type {
  AssignDriverInput,
  DeliverDropInput,
  DispatchBoardDto,
  DriverDayDto,
  DropDto,
} from '@fernleaf/shared';
import { ClockService } from '../common/clock/clock.service.js';
import { dbDateToIso, isoDateToDb } from '../common/dates.js';
import { BusinessRuleError, ConflictError, NotFoundError } from '../common/errors/domain-error.js';
import type { IsoDate } from '../domain/calendar.js';
import {
  deliveredOnTime,
  dropStage,
  dropStepProblem,
  type DropProgress,
  type DropStep,
} from '../domain/operations.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const dropInclude = {
  company: { select: { id: true, name: true, driverInstructions: true } },
  address: { select: { instructions: true } },
  driver: { select: { id: true, name: true, phone: true } },
  photo: { select: { id: true } },
  // Only orders that travel: cancelled and rejected ones stay out of the van.
  orders: {
    where: { status: { in: ['CONFIRMED', 'DELIVERED'] } },
    orderBy: { number: 'asc' },
    select: {
      id: true,
      number: true,
      status: true,
      packagingName: true,
      notes: true,
      addressText: true,
      kitchenReadyAt: true,
      plannedDispatchReadyAt: true,
      employee: { select: { firstName: true, lastName: true } },
      lines: { select: { quantity: true } },
    },
  },
} satisfies Prisma.DropInclude;

type DropWithOrders = Prisma.DropGetPayload<{ include: typeof dropInclude }>;

interface Actor {
  id: string;
  name: string;
}

const STEP_EVENTS = {
  DISPATCH_READY: { type: 'DISPATCH_READY', message: 'Packed and dispatch ready.' },
  OUT_FOR_DELIVERY: { type: 'OUT_FOR_DELIVERY', message: 'Out for delivery' },
} as const;

/**
 * Dispatch and delivery (spec 4.8). A drop is every order for one company, address and
 * delivery time. Each step locks the drop's row, checks the step is next, and records it
 * once: a repeated or skipped step is refused with a clear message.
 */
@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  async board(date: IsoDate): Promise<DispatchBoardDto> {
    const deliveryDate = isoDateToDb(date);
    const [settings, drops, drivers, loose] = await Promise.all([
      this.graceSettings(),
      this.prisma.drop.findMany({
        where: { deliveryDate },
        orderBy: [{ deliveryAt: 'asc' }, { createdAt: 'asc' }],
        include: dropInclude,
      }),
      // "Can be given drops" is a permission, never a role name.
      this.prisma.user.findMany({
        where: { isActive: true, role: { permissions: { has: 'DELIVERIES_OWN' } } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      this.prisma.order.findMany({
        where: { deliveryDate, status: 'CONFIRMED', dropId: null },
        orderBy: [{ deliveryTimeMinutes: 'asc' }, { number: 'asc' }],
        select: {
          id: true,
          number: true,
          deliveryTimeMinutes: true,
          company: { select: { name: true } },
          employee: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);
    const now = this.clock.now();
    const dtos = drops
      .filter((drop) => drop.orders.length > 0)
      .map((drop) => toDropDto(drop, now, settings.onTimeGraceMinutes));
    return {
      date,
      now: now.toISOString(),
      onTimeGraceMinutes: settings.onTimeGraceMinutes,
      drops: dtos,
      drivers: drivers.map((driver) => {
        const mine = dtos.filter((drop) => drop.driver?.id === driver.id);
        return {
          ...driver,
          drops: mine.length,
          delivered: mine.filter((drop) => drop.stage === 'DELIVERED').length,
        };
      }),
      ordersWithoutDrop: loose.map((order) => ({
        id: order.id,
        number: order.number,
        employeeName: `${order.employee.firstName} ${order.employee.lastName}`,
        companyName: order.company.name,
        deliveryTimeMinutes: order.deliveryTimeMinutes,
      })),
    };
  }

  /** The driver's view: only their own drops, only today, in time order (spec 4.8). */
  async driverDay(driverId: string): Promise<DriverDayDto> {
    const today = this.clock.kitchenToday();
    const [settings, drops] = await Promise.all([
      this.graceSettings(),
      this.prisma.drop.findMany({
        where: { driverId, deliveryDate: isoDateToDb(today) },
        orderBy: [{ deliveryAt: 'asc' }, { createdAt: 'asc' }],
        include: dropInclude,
      }),
    ]);
    const now = this.clock.now();
    return {
      date: today,
      now: now.toISOString(),
      drops: drops
        .filter((drop) => drop.orders.length > 0)
        .map((drop) => toDropDto(drop, now, settings.onTimeGraceMinutes)),
    };
  }

  /** Dispatch picks the driver (a new drop starts with the company's default driver). */
  async assignDriver(dropId: string, input: AssignDriverInput, actor: Actor): Promise<DropDto> {
    const driver = input.driverId
      ? await this.prisma.user.findFirst({
          where: {
            id: input.driverId,
            isActive: true,
            role: { permissions: { has: 'DELIVERIES_OWN' } },
          },
          select: { id: true, name: true },
        })
      : null;
    if (input.driverId && !driver) {
      throw new BusinessRuleError('NOT_A_DRIVER', 'Pick an active driver.', [
        { path: 'driverId', message: 'Pick an active driver.' },
      ]);
    }
    await this.prisma.$transaction(async (tx) => {
      const drop = await this.lockDrop(tx, dropId);
      if (drop.outForDeliveryAt) {
        throw new ConflictError(
          `This drop already left with ${drop.driver?.name ?? 'its driver'} - the driver can’t change now.`,
          'DROP_LEFT',
        );
      }
      await tx.drop.update({
        where: { id: dropId },
        data: { driverId: driver?.id ?? null, version: { increment: 1 } },
      });
      await tx.orderEvent.createMany({
        data: drop.orders.map((order) => ({
          orderId: order.id,
          type: 'DRIVER_ASSIGNED' as const,
          actorId: actor.id,
          message: driver ? `Driver: ${driver.name}.` : 'Driver taken off the drop.',
          createdAt: this.clock.now(),
        })),
      });
    });
    return this.dropDto(dropId);
  }

  /** Every order in the drop is kitchen ready and it is packed to go. */
  async markDispatchReady(dropId: string, actor: Actor): Promise<DropDto> {
    return this.step(dropId, 'DISPATCH_READY', actor, async (tx, now) => {
      await tx.drop.update({
        where: { id: dropId },
        data: { dispatchReadyAt: now, version: { increment: 1 } },
      });
    });
  }

  /** Handed to the driver. Needs dispatch ready and a driver. */
  async markOutForDelivery(dropId: string, actor: Actor): Promise<DropDto> {
    return this.step(dropId, 'OUT_FOR_DELIVERY', actor, async (tx, now) => {
      await tx.drop.update({
        where: { id: dropId },
        data: { outForDeliveryAt: now, version: { increment: 1 } },
      });
    });
  }

  /**
   * Delivered, with an optional note and photo. Every order in the drop becomes delivered,
   * and whether it was on time is recorded now - it never changes afterwards.
   * `onlyDriverId` limits a driver to their own drops for today; anything else is "not found".
   */
  async deliver(
    dropId: string,
    input: DeliverDropInput,
    actor: Actor,
    onlyDriverId: string | null,
  ): Promise<DropDto> {
    const { onTimeGraceMinutes } = await this.graceSettings();
    return this.step(
      dropId,
      'DELIVERED',
      actor,
      async (tx, now, drop) => {
        const onTime = deliveredOnTime(now, drop.deliveryAt, onTimeGraceMinutes);
        const photo = input.photo ? Buffer.from(input.photo.dataBase64, 'base64') : null;
        await tx.drop.update({
          where: { id: dropId },
          data: {
            deliveredAt: now,
            deliveredOnTime: onTime,
            deliveryNote: input.note || null,
            version: { increment: 1 },
            ...(photo && input.photo
              ? {
                  photo: {
                    create: {
                      mimeType: input.photo.mimeType,
                      sizeBytes: photo.length,
                      data: photo,
                    },
                  },
                }
              : {}),
          },
        });
        await tx.order.updateMany({
          where: { dropId, status: 'CONFIRMED' },
          data: { status: 'DELIVERED', version: { increment: 1 } },
        });
        const late = Math.round((now.getTime() - drop.deliveryAt.getTime()) / 60_000);
        const timing = onTime ? 'on time' : `${late} minutes after the agreed time (not on time)`;
        return `Delivered by ${actor.name}, ${timing}.${input.note ? ` Note: “${input.note}”.` : ''}${photo ? ' Photo attached.' : ''}`;
      },
      (drop) => {
        if (onlyDriverId === null) return;
        const today = this.clock.kitchenToday();
        if (drop.driverId !== onlyDriverId || dbDateToIso(drop.deliveryDate) !== today) {
          throw new NotFoundError('Drop');
        }
      },
    );
  }

  async photo(dropId: string): Promise<{ mimeType: string; data: Uint8Array }> {
    const photo = await this.prisma.deliveryPhoto.findUnique({ where: { dropId } });
    if (!photo) throw new NotFoundError('Photo');
    return photo;
  }

  /**
   * Runs one drop step: lock the drop row (two clicks at once queue up), check the step is
   * the next one, apply it, and write it on every order's timeline.
   */
  private async step(
    dropId: string,
    step: DropStep,
    actor: Actor,
    apply: (
      tx: Prisma.TransactionClient,
      now: Date,
      drop: DropWithOrders,
    ) => Promise<string | void>,
    guard?: (drop: DropWithOrders) => void,
  ): Promise<DropDto> {
    await this.prisma.$transaction(async (tx) => {
      const drop = await this.lockDrop(tx, dropId);
      guard?.(drop);
      const problem = dropStepProblem(step, progressOf(drop));
      if (problem?.kind === 'REPEATED') throw new ConflictError(problem.message, 'STEP_REPEATED');
      if (problem) throw new BusinessRuleError('STEP_OUT_OF_ORDER', problem.message);

      const now = this.clock.now();
      const message = await apply(tx, now, drop);
      const text =
        step === 'DELIVERED'
          ? (message ?? 'Delivered.')
          : step === 'OUT_FOR_DELIVERY'
            ? `${STEP_EVENTS.OUT_FOR_DELIVERY.message} with ${drop.driver?.name ?? 'the driver'}.`
            : STEP_EVENTS.DISPATCH_READY.message;
      await tx.orderEvent.createMany({
        data: drop.orders.map((order) => ({
          orderId: order.id,
          type: step,
          actorId: actor.id,
          message: text,
          createdAt: now,
        })),
      });
    });
    return this.dropDto(dropId);
  }

  private async lockDrop(tx: Prisma.TransactionClient, dropId: string): Promise<DropWithOrders> {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "Drop" WHERE id = ${dropId} FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundError('Drop');
    return tx.drop.findUniqueOrThrow({ where: { id: dropId }, include: dropInclude });
  }

  private async dropDto(dropId: string): Promise<DropDto> {
    const [drop, settings] = await Promise.all([
      this.prisma.drop.findUniqueOrThrow({ where: { id: dropId }, include: dropInclude }),
      this.graceSettings(),
    ]);
    return toDropDto(drop, this.clock.now(), settings.onTimeGraceMinutes);
  }

  private graceSettings() {
    return this.prisma.platformSettings.findUniqueOrThrow({
      where: { id: 1 },
      select: { onTimeGraceMinutes: true },
    });
  }
}

function progressOf(drop: DropWithOrders): DropProgress {
  return {
    dispatchReadyAt: drop.dispatchReadyAt,
    outForDeliveryAt: drop.outForDeliveryAt,
    deliveredAt: drop.deliveredAt,
    driverId: drop.driverId,
    orders: drop.orders.length,
    ordersReady: drop.orders.filter((order) => order.kitchenReadyAt).length,
  };
}

function toDropDto(drop: DropWithOrders, now: Date, graceMinutes: number): DropDto {
  const progress = progressOf(drop);
  const plannedDispatch = drop.orders.reduce<Date>(
    (earliest, order) =>
      order.plannedDispatchReadyAt < earliest ? order.plannedDispatchReadyAt : earliest,
    drop.deliveryAt,
  );
  const iso = (value: Date | null) => value?.toISOString() ?? null;
  return {
    id: drop.id,
    deliveryDate: dbDateToIso(drop.deliveryDate),
    deliveryTimeMinutes: drop.deliveryTimeMinutes,
    deliveryAt: drop.deliveryAt.toISOString(),
    company: { id: drop.company.id, name: drop.company.name },
    addressText: drop.orders[0]?.addressText ?? '',
    instructions: [drop.company.driverInstructions, drop.address.instructions]
      .map((text) => text.trim())
      .filter((text) => text.length > 0),
    driver: drop.driver,
    stage: dropStage(progress),
    plannedDispatchReadyAt: plannedDispatch.toISOString(),
    dispatchReadyAt: iso(drop.dispatchReadyAt),
    outForDeliveryAt: iso(drop.outForDeliveryAt),
    deliveredAt: iso(drop.deliveredAt),
    deliveredOnTime: drop.deliveredOnTime,
    deliveryNote: drop.deliveryNote,
    hasPhoto: drop.photo !== null,
    lateLeaving: !drop.outForDeliveryAt && now > plannedDispatch,
    lateDelivering: !drop.deliveredAt && !deliveredOnTime(now, drop.deliveryAt, graceMinutes),
    meals: drop.orders.reduce(
      (sum, order) => sum + order.lines.reduce((lines, line) => lines + line.quantity, 0),
      0,
    ),
    ordersReady: progress.ordersReady,
    orders: drop.orders.map((order) => ({
      id: order.id,
      number: order.number,
      status: order.status === 'DELIVERED' ? 'DELIVERED' : 'CONFIRMED',
      employeeName: `${order.employee.firstName} ${order.employee.lastName}`,
      meals: order.lines.reduce((sum, line) => sum + line.quantity, 0),
      packagingName: order.packagingName,
      notes: order.notes,
      kitchenReadyAt: iso(order.kitchenReadyAt),
    })),
  };
}
