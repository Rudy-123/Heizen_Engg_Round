import { Injectable } from '@nestjs/common';
import {
  formatCents,
  minutesToTime,
  type CreateOrderInput,
  type DeliveryDateOptionDto,
  type DeliveryOverrideInput,
  type FieldError,
  type MenuDishDto,
  type OrderContentInput,
  type OrderDetailDto,
  type OrderFormContextDto,
  type OrderListQuery,
  type OrderQuoteDto,
  type OrderSummaryDto,
  type Page,
  type Permission,
  type QuoteOrderInput,
  type UpdateOrderInput,
} from '@fernleaf/shared';
import { DateTime } from 'luxon';
import { ClockService } from '../common/clock/clock.service.js';
import { dbDateToIso, isoDateToDb } from '../common/dates.js';
import { BusinessRuleError, ConflictError, NotFoundError } from '../common/errors/domain-error.js';
import {
  addDays,
  cutoffInstant,
  deliveryDateProblems,
  isWorkingDay,
  type IsoDate,
  type WorkCalendar,
} from '../domain/calendar.js';
import {
  priceOrderLines,
  type LockedCombination,
  type OrderableDish,
  type PricedLine,
} from '../domain/combinations.js';
import { deliveryTimeProblem } from '../domain/delivery-slots.js';
import { orderActionProblem, plannedTimes, type OrderAction } from '../domain/order-rules.js';
import type { Prisma } from '../generated/prisma/client.js';
import { MenuService } from '../menu/menu.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService, type KitchenRules } from '../settings/settings.service.js';
import { joinDrop, removeDropIfEmpty, reopenIfPacked } from './drops.js';

/** Who is acting: a staff member, or the system (id null - e.g. automatic cut-off processing). */
export interface Actor {
  id: string | null;
  permissions: readonly Permission[];
}

const detailInclude = {
  employee: { select: { id: true, firstName: true, lastName: true, email: true } },
  company: { select: { id: true, name: true } },
  priceTier: { select: { id: true, name: true } },
  invoice: { select: { id: true, number: true } },
  drop: { select: { outForDeliveryAt: true } },
  lines: {
    orderBy: { sortOrder: 'asc' },
    include: {
      combinations: { orderBy: { id: 'asc' }, include: { options: { orderBy: { id: 'asc' } } } },
    },
  },
  // Events written in one go share a timestamp; the id (created in order) breaks the tie.
  events: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: { actor: { select: { name: true } } },
  },
} satisfies Prisma.OrderInclude;

type OrderWithDetails = Prisma.OrderGetPayload<{ include: typeof detailInclude }>;

const employeeForOrder = {
  company: {
    include: {
      addresses: { where: { isActive: true }, orderBy: [{ isDefault: 'desc' }, { label: 'asc' }] },
      holidays: true,
    },
  },
  allergies: { include: { allergen: true } },
} satisfies Prisma.EmployeeInclude;

type EmployeeForOrder = Prisma.EmployeeGetPayload<{ include: typeof employeeForOrder }>;

/** An order checked against every rule and priced, ready to save. */
interface PreparedOrder {
  employee: EmployeeForOrder;
  tier: { id: string; name: string };
  deliveryDate: IsoDate;
  deliveryTimeMinutes: number;
  address: { id: string; text: string };
  packaging: { id: string; name: string };
  leadMinutes: number;
  planned: ReturnType<typeof plannedTimes>;
  lines: PricedLine[];
  totalCents: number;
  cutoffAt: Date | null;
  locked: boolean;
}

/** An existing order being edited or placed: its tier, and (if placed) its locked prices. */
const editInclude = {
  drop: true,
  lines: {
    orderBy: { sortOrder: 'asc' },
    include: {
      combinations: { orderBy: { id: 'asc' }, include: { options: { orderBy: { id: 'asc' } } } },
    },
  },
} satisfies Prisma.OrderInclude;

type ExistingOrder = Prisma.OrderGetPayload<{ include: typeof editInclude }>;

/** Orders (spec 4.6): create, edit, place, cancel, reject, admin overrides, list and detail. */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly settings: SettingsService,
    private readonly menu: MenuService,
  ) {}

  // ---------------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------------

  async list(query: OrderListQuery): Promise<Page<OrderSummaryDto>> {
    const where: Prisma.OrderWhereInput = {
      ...(query.from || query.to
        ? {
            deliveryDate: {
              ...(query.from ? { gte: isoDateToDb(query.from) } : {}),
              ...(query.to ? { lte: isoDateToDb(query.to) } : {}),
            },
          }
        : {}),
      ...(query.status.length > 0 ? { status: { in: query.status } } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.invoiced === 'yes' ? { invoiceId: { not: null } } : {}),
      ...(query.invoiced === 'no' ? { invoiceId: null } : {}),
      ...(query.search ? searchFilter(query.search) : {}),
    };
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true } },
          company: { select: { id: true, name: true } },
          lines: { select: { quantity: true } },
        },
        orderBy: [{ deliveryDate: 'desc' }, { deliveryTimeMinutes: 'asc' }, { number: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      items: orders.map((order) => ({
        id: order.id,
        number: order.number,
        status: order.status,
        deliveryDate: dbDateToIso(order.deliveryDate),
        deliveryTimeMinutes: order.deliveryTimeMinutes,
        employee: {
          id: order.employee.id,
          name: `${order.employee.firstName} ${order.employee.lastName}`,
        },
        company: order.company,
        totalCents: order.totalCents,
        mealCount: order.lines.reduce((sum, line) => sum + line.quantity, 0),
        isInvoiced: order.invoiceId !== null,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string, actor: Actor): Promise<OrderDetailDto> {
    const order = await this.prisma.order.findUnique({ where: { id }, include: detailInclude });
    if (!order) throw new NotFoundError('Order');
    return this.toDetail(order, actor, await this.settings.getKitchenRules());
  }

  /** Everything the order form needs for one employee: menu, dates, addresses, defaults. */
  async formContext(employeeId: string): Promise<OrderFormContextDto> {
    const employee = await this.findEmployee(employeeId);
    const [rules, settings, packagingTypes, menu] = await Promise.all([
      this.settings.getKitchenRules(),
      this.prisma.platformSettings.findUniqueOrThrow({ where: { id: 1 } }),
      this.prisma.packagingType.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.menu.menuForEmployee(employeeId),
    ]);
    const today = this.clock.kitchenToday();
    const deliveryDates: DeliveryDateOptionDto[] = Array.from({ length: 14 }, (_, offset) => {
      const date = addDays(today, offset);
      const problems = this.dateProblems(date, employee, rules);
      const cutoffAt = isWorkingDay(date, rules.calendar)
        ? cutoffInstant(date, rules.calendar, rules.cutoff, rules.zone)
        : null;
      return {
        date,
        problems,
        cutoffAt: cutoffAt?.toISOString() ?? null,
        isLocked: cutoffAt !== null && this.clock.now() >= cutoffAt,
      };
    });
    const deliveryTimes: number[] = [];
    for (
      let minutes = settings.deliveryWindowStartMinutes;
      minutes <= settings.deliveryWindowEndMinutes;
      minutes += settings.deliverySlotMinutes
    ) {
      deliveryTimes.push(minutes);
    }
    const { company } = employee;
    return {
      employee: {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
        email: employee.email,
        company: { id: company.id, name: company.name },
        canChooseAddress: employee.canChooseAddress,
        canChangeDeliveryTime: employee.canChangeDeliveryTime,
        canChangePackaging: employee.canChangePackaging,
        allergies: employee.allergies.map((a) => ({ id: a.allergen.id, name: a.allergen.name })),
      },
      defaults: {
        deliveryTimeMinutes: company.defaultDeliveryTimeMinutes,
        addressId: company.addresses.find((a) => a.isDefault)?.id ?? null,
        packagingTypeId: company.defaultPackagingTypeId,
      },
      addresses: company.addresses.map((a) => ({ id: a.id, label: a.label, text: addressText(a) })),
      packagingTypes: packagingTypes.map((p) => ({ id: p.id, name: p.name })),
      deliveryTimes,
      deliveryDates,
      menu,
    };
  }

  /** Prices an order without saving it: the breakdown per line and the total (spec 4.6). */
  async quote(input: QuoteOrderInput): Promise<OrderQuoteDto> {
    const existing = input.orderId ? await this.findForEdit(input.orderId) : undefined;
    const prepared = await this.prepare(input.employeeId, input, existing);
    return {
      lines: prepared.lines.map((line) => ({
        dishId: line.dishId,
        dishName: line.dishName,
        quantity: line.quantity,
        dishUnitPriceCents: line.dishUnitPriceCents,
        lineTotalCents: line.lineTotalCents,
        combinations: line.combinations.map((c) => ({
          quantity: c.quantity,
          unitPriceCents: c.unitPriceCents,
          totalCents: c.totalCents,
          lockedPrice: c.lockedPrice,
          options: c.options.map((o) => ({
            optionName: o.optionName,
            groupName: o.groupName,
            portionName: o.portionName,
            priceCents: o.priceCents,
          })),
        })),
      })),
      totalCents: prepared.totalCents,
      tier: prepared.tier,
    };
  }

  // ---------------------------------------------------------------------------------
  // Writing
  // ---------------------------------------------------------------------------------

  /** Saves a draft, or places the order straight away (prices lock when placed). */
  async create(input: CreateOrderInput, actor: Actor): Promise<OrderDetailDto> {
    const prepared = await this.prepare(input.employeeId, input);
    const { employee } = prepared;
    if (!employee.isActive || !employee.company.isActive) {
      throw new BusinessRuleError(
        'INACTIVE_CUSTOMER',
        `${employee.isActive ? employee.company.name : `${employee.firstName} ${employee.lastName}`} is switched off, so new orders can’t be made.`,
      );
    }
    this.checkCutoff(prepared, input.place ? 'PLACE' : 'DRAFT', actor);

    const now = this.clock.now();
    const order = await this.prisma.order.create({
      data: {
        status: input.place ? 'PLACED' : 'DRAFT',
        employeeId: employee.id,
        companyId: employee.companyId,
        ...headerFields(prepared, input.notes),
        createdById: actor.id,
        placedAt: input.place ? now : null,
        createdAt: now,
        lines: { create: linesCreate(prepared.lines) },
        events: {
          create: {
            type: input.place ? 'PLACED' : 'CREATED',
            actorId: actor.id,
            createdAt: now,
            message: input.place
              ? `Placed for ${formatCents(prepared.totalCents)} - prices are now locked.`
              : `Saved as a draft (${formatCents(prepared.totalCents)} at today’s prices).`,
          },
        },
      },
    });
    return this.get(order.id, actor);
  }

  /**
   * Edits a draft or placed order. A draft is re-priced at today's prices; on a placed order,
   * combinations that already existed keep the price they were placed at.
   */
  async update(id: string, input: UpdateOrderInput, actor: Actor): Promise<OrderDetailDto> {
    const existing = await this.findForEdit(id);
    const prepared = await this.prepare(existing.employeeId, input, existing);
    const rules = await this.settings.getKitchenRules();
    const wasLocked = this.isLocked(dbDateToIso(existing.deliveryDate), rules);
    this.checkAction('EDIT', existing, prepared.locked || wasLocked, actor);
    if (existing.status === 'DRAFT') this.checkCutoff(prepared, 'DRAFT', actor);

    await this.prisma.$transaction(async (tx) => {
      await this.bumpVersion(tx, id, input.version, ['DRAFT', 'PLACED']);
      await tx.orderLine.deleteMany({ where: { orderId: id } });
      await tx.order.update({
        where: { id },
        data: {
          ...headerFields(prepared, input.notes),
          lines: { create: linesCreate(prepared.lines) },
          events: {
            create: {
              type: 'UPDATED',
              actorId: actor.id,
              createdAt: this.clock.now(),
              message: `Changed: ${describeOrder(prepared)}.`,
            },
          },
        },
      });
    });
    return this.get(id, actor);
  }

  /** Draft -> placed. The order is checked again and priced at today's prices, which then lock. */
  async place(id: string, version: number, actor: Actor): Promise<OrderDetailDto> {
    const existing = await this.findForEdit(id);
    const content: OrderContentInput = {
      deliveryDate: dbDateToIso(existing.deliveryDate),
      deliveryTimeMinutes: existing.deliveryTimeMinutes,
      addressId: existing.addressId,
      packagingTypeId: existing.packagingTypeId,
      notes: existing.notes,
      lines: existing.lines.map((line) => ({
        dishId: line.dishId,
        quantity: line.quantity,
        combinations: line.combinations.map((combination) => ({
          quantity: combination.quantity,
          choices: combination.options.map((option) => ({
            groupId: option.optionGroupId ?? '',
            optionId: option.optionId,
            portionSizeId: option.portionSizeId,
          })),
        })),
      })),
    };
    const prepared = await this.prepare(existing.employeeId, content, existing);
    this.checkAction('PLACE', existing, prepared.locked, actor);

    await this.prisma.$transaction(async (tx) => {
      await this.bumpVersion(tx, id, version, ['DRAFT']);
      await tx.orderLine.deleteMany({ where: { orderId: id } });
      await tx.order.update({
        where: { id },
        data: {
          ...headerFields(prepared, existing.notes),
          status: 'PLACED',
          placedAt: this.clock.now(),
          lines: { create: linesCreate(prepared.lines) },
          events: {
            create: {
              type: 'PLACED',
              actorId: actor.id,
              message: `Placed for ${formatCents(prepared.totalCents)} - prices are now locked.`,
              createdAt: this.clock.now(),
            },
          },
        },
      });
    });
    return this.get(id, actor);
  }

  async cancel(id: string, version: number, reason: string, actor: Actor): Promise<OrderDetailDto> {
    return this.endOrder(id, version, reason, actor, 'CANCEL');
  }

  async reject(id: string, version: number, reason: string, actor: Actor): Promise<OrderDetailDto> {
    return this.endOrder(id, version, reason, actor, 'REJECT');
  }

  /**
   * Spec 4.6 "Admin overrides": change a confirmed order's delivery time, address or
   * packaging. Planned times are worked out again and the order moves to the right drop.
   * Money never changes.
   */
  async changeDelivery(
    id: string,
    input: DeliveryOverrideInput,
    actor: Actor,
  ): Promise<OrderDetailDto> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        drop: true,
        company: { include: { addresses: { where: { isActive: true } } } },
      },
    });
    if (!order) throw new NotFoundError('Order');
    const rules = await this.settings.getKitchenRules();
    this.checkAction(
      'CHANGE_DELIVERY',
      order,
      this.isLocked(dbDateToIso(order.deliveryDate), rules),
      actor,
    );

    const problems: FieldError[] = [];
    const settings = await this.prisma.platformSettings.findUniqueOrThrow({ where: { id: 1 } });
    const timeProblem = deliveryTimeProblem(input.deliveryTimeMinutes, windowOf(settings));
    if (timeProblem) problems.push({ path: 'deliveryTimeMinutes', message: timeProblem });
    const address = order.company.addresses.find((a) => a.id === input.addressId);
    if (!address)
      problems.push({ path: 'addressId', message: 'Pick one of the company’s addresses.' });
    const packaging = await this.prisma.packagingType.findUnique({
      where: { id: input.packagingTypeId },
    });
    if (!packaging?.isActive)
      problems.push({ path: 'packagingTypeId', message: 'Pick packaging in use.' });
    if (!address || !packaging || problems.length > 0) {
      throw new BusinessRuleError('ORDER_INVALID', 'Some things need fixing.', problems);
    }

    const planned = plannedTimes(
      dbDateToIso(order.deliveryDate),
      input.deliveryTimeMinutes,
      order.deliveryLeadMinutes,
      rules.zone,
    );
    const was = `${minutesToTime(order.deliveryTimeMinutes)}, ${order.addressText}, ${order.packagingName}`;
    await this.prisma.$transaction(async (tx) => {
      await this.bumpVersion(tx, id, input.version, ['CONFIRMED']);
      const drop = await joinDrop(
        tx,
        {
          deliveryDate: order.deliveryDate,
          companyId: order.companyId,
          addressId: address.id,
          deliveryTimeMinutes: input.deliveryTimeMinutes,
          deliveryAt: planned.deliveryAt,
        },
        order.company.defaultDriverId,
      );
      if (drop.id !== order.dropId) {
        if (drop.outForDeliveryAt) {
          throw new ConflictError(
            'The drop for that time and address has already left.',
            'DROP_LEFT',
          );
        }
        await reopenIfPacked(tx, drop);
      }
      await tx.order.update({
        where: { id },
        data: {
          deliveryTimeMinutes: input.deliveryTimeMinutes,
          addressId: address.id,
          addressText: addressText(address),
          packagingTypeId: packaging.id,
          packagingName: packaging.name,
          ...planned,
          dropId: drop.id,
          events: {
            create: {
              type: 'DELIVERY_CHANGED',
              actorId: actor.id,
              createdAt: this.clock.now(),
              message: `Delivery changed to ${minutesToTime(input.deliveryTimeMinutes)}, ${addressText(address)}, ${packaging.name} (was ${was}).`,
            },
          },
        },
      });
      if (order.dropId && order.dropId !== drop.id) await removeDropIfEmpty(tx, order.dropId);
    });
    return this.get(id, actor);
  }

  // ---------------------------------------------------------------------------------
  // Rules
  // ---------------------------------------------------------------------------------

  /**
   * Checks an order against every rule and prices it: the delivery date (kitchen and company
   * calendars), the employee's permission flags for address, time and packaging, and every
   * line and combination against the employee's menu (spec 4.1-4.6). All problems are
   * reported together, each on its form field.
   */
  private async prepare(
    employeeId: string,
    content: OrderContentInput,
    existing?: ExistingOrder,
  ): Promise<PreparedOrder> {
    const employee = await this.findEmployee(employeeId);
    const { company } = employee;
    const [rules, settings] = await Promise.all([
      this.settings.getKitchenRules(),
      this.prisma.platformSettings.findUniqueOrThrow({ where: { id: 1 } }),
    ]);
    const problems: FieldError[] = [];
    const name = employee.firstName;

    // When
    for (const message of this.dateProblems(content.deliveryDate, employee, rules)) {
      problems.push({ path: 'deliveryDate', message });
    }
    const cutoffAt = isWorkingDay(content.deliveryDate, rules.calendar)
      ? cutoffInstant(content.deliveryDate, rules.calendar, rules.cutoff, rules.zone)
      : null;
    const time = content.deliveryTimeMinutes ?? company.defaultDeliveryTimeMinutes;
    if (!employee.canChangeDeliveryTime && time !== company.defaultDeliveryTimeMinutes) {
      problems.push({
        path: 'deliveryTimeMinutes',
        message: `${name} can’t change the delivery time - ${company.name} receives at ${minutesToTime(company.defaultDeliveryTimeMinutes)}.`,
      });
    }
    const timeProblem = deliveryTimeProblem(time, windowOf(settings));
    if (timeProblem) problems.push({ path: 'deliveryTimeMinutes', message: timeProblem });

    // Where
    const defaultAddress = company.addresses.find((a) => a.isDefault);
    const address = content.addressId
      ? company.addresses.find((a) => a.id === content.addressId)
      : defaultAddress;
    if (!address) {
      problems.push({
        path: 'addressId',
        message: `Pick one of ${company.name}’s delivery addresses.`,
      });
    } else if (!employee.canChooseAddress && address.id !== defaultAddress?.id) {
      problems.push({
        path: 'addressId',
        message: `${name} can’t choose an address - orders go to ${defaultAddress?.label ?? 'the default address'}.`,
      });
    }

    // How it's packed
    const packagingId = content.packagingTypeId ?? company.defaultPackagingTypeId;
    const packaging = packagingId
      ? await this.prisma.packagingType.findUnique({ where: { id: packagingId } })
      : null;
    if (!packaging?.isActive) {
      problems.push({ path: 'packagingTypeId', message: 'Pick packaging that is in use.' });
    } else if (!employee.canChangePackaging && packaging.id !== company.defaultPackagingTypeId) {
      problems.push({
        path: 'packagingTypeId',
        message: `${name} can’t change packaging - ${company.name} uses its default.`,
      });
    }

    // What: the employee's own menu. A placed order keeps its tier; a draft uses today's.
    const tierId = existing?.status === 'PLACED' ? existing.priceTierId : undefined;
    const menu = await this.menu.menuForEmployee(employeeId, tierId);
    const orderable = await this.orderableDishes(
      menu.sections.concat(menu.secretSections).flatMap((s) => s.dishes),
    );
    const priced = priceOrderLines(content.lines, orderable, lockedPrices(existing));
    problems.push(...priced.problems);

    if (problems.length > 0 || !address || !packaging) {
      throw new BusinessRuleError(
        'ORDER_INVALID',
        problems[0]?.message ?? 'Some things need fixing.',
        problems,
      );
    }
    return {
      employee,
      tier: { id: menu.tier.id, name: menu.tier.name },
      deliveryDate: content.deliveryDate,
      deliveryTimeMinutes: time,
      address: { id: address.id, text: addressText(address) },
      packaging: { id: packaging.id, name: packaging.name },
      leadMinutes: company.deliveryLeadMinutes,
      planned: plannedTimes(content.deliveryDate, time, company.deliveryLeadMinutes, rules.zone),
      lines: priced.lines,
      totalCents: priced.totalCents,
      cutoffAt,
      locked: cutoffAt !== null && this.clock.now() >= cutoffAt,
    };
  }

  /** Spec 4.4/4.6: not in the past, and both the kitchen and the company are open that day. */
  private dateProblems(date: IsoDate, employee: EmployeeForOrder, rules: KitchenRules): string[] {
    const company: WorkCalendar = {
      workingDays: employee.company.workingDays,
      holidays: new Set(employee.company.holidays.map((h) => dbDateToIso(h.date))),
    };
    const holiday = employee.company.holidays.find((h) => dbDateToIso(h.date) === date);
    return deliveryDateProblems(date, {
      today: this.clock.kitchenToday(),
      kitchen: rules.calendar,
      company,
    }).map((problem) => {
      switch (problem) {
        case 'IN_THE_PAST':
          return 'That date has passed.';
        case 'KITCHEN_CLOSED':
          return 'The kitchen is closed that day.';
        case 'COMPANY_CLOSED':
          return holiday
            ? `${employee.company.name} is closed that day (${holiday.name}).`
            : `${employee.company.name} doesn’t take deliveries that day.`;
      }
    });
  }

  /**
   * Spec 4.6: orders lock at the cut-off. A draft can't be saved for a locked date at all
   * (the cut-off would cancel it straight away); placing after it needs the override
   * permission - the order then waits for the next cut-off run to be confirmed.
   */
  private checkCutoff(prepared: PreparedOrder, intent: 'DRAFT' | 'PLACE', actor: Actor): void {
    if (!prepared.locked || !prepared.cutoffAt) return;
    const when = DateTime.fromJSDate(prepared.cutoffAt, {
      zone: this.clock.kitchenTimeZone,
    }).toFormat('ccc d LLL, HH:mm');
    if (intent === 'DRAFT') {
      const message = `Orders for this date locked at ${when}, so it can’t be saved as a draft.`;
      throw new BusinessRuleError('CUTOFF_PASSED', message, [{ path: 'deliveryDate', message }]);
    }
    if (!actor.permissions.includes('ORDERS_OVERRIDE')) {
      const message = `Orders for this date locked at ${when}. Only an admin can still place one.`;
      throw new BusinessRuleError('CUTOFF_PASSED', message, [{ path: 'deliveryDate', message }]);
    }
  }

  private checkAction(
    action: OrderAction,
    order: { status: OrderWithDetails['status']; drop?: { outForDeliveryAt: Date | null } | null },
    locked: boolean,
    actor: Actor,
  ): void {
    const problem = orderActionProblem(action, {
      status: order.status,
      locked,
      canWrite: actor.permissions.includes('ORDERS_WRITE'),
      canOverride: actor.permissions.includes('ORDERS_OVERRIDE'),
      outForDelivery: order.drop?.outForDeliveryAt != null,
    });
    if (problem) throw new BusinessRuleError('ORDER_ACTION_NOT_ALLOWED', problem);
  }

  /**
   * Optimistic locking: the change only applies if nobody changed the order since the person
   * loaded it (and it is still in a status the change is allowed from).
   */
  private async bumpVersion(
    tx: Prisma.TransactionClient,
    id: string,
    version: number,
    statuses: OrderWithDetails['status'][],
  ): Promise<void> {
    const { count } = await tx.order.updateMany({
      where: { id, version, status: { in: statuses } },
      data: { version: { increment: 1 } },
    });
    if (count === 0) {
      throw new ConflictError(
        'Someone else changed this order a moment ago. Reload it to see their changes.',
        'ORDER_CHANGED',
      );
    }
  }

  private isLocked(date: IsoDate, rules: KitchenRules): boolean {
    if (!isWorkingDay(date, rules.calendar)) return false;
    return this.clock.now() >= cutoffInstant(date, rules.calendar, rules.cutoff, rules.zone);
  }

  /**
   * Cancel or reject. If the order was already on an invoice, a full credit is raised for the
   * company's next invoice - issued invoices never change (README: post-invoice policy).
   */
  private async endOrder(
    id: string,
    version: number,
    reason: string,
    actor: Actor,
    action: 'CANCEL' | 'REJECT',
  ): Promise<OrderDetailDto> {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { drop: true } });
    if (!order) throw new NotFoundError('Order');
    const rules = await this.settings.getKitchenRules();
    this.checkAction(action, order, this.isLocked(dbDateToIso(order.deliveryDate), rules), actor);

    const now = this.clock.now();
    const cancelling = action === 'CANCEL';
    await this.prisma.$transaction(async (tx) => {
      await this.bumpVersion(tx, id, version, ['DRAFT', 'PLACED', 'CONFIRMED']);
      await tx.order.update({
        where: { id },
        data: {
          status: cancelling ? 'CANCELLED' : 'REJECTED',
          ...(cancelling ? { cancelledAt: now } : { rejectedAt: now }),
          statusReason: reason,
          events: {
            create: {
              type: cancelling ? 'CANCELLED' : 'REJECTED',
              actorId: actor.id,
              createdAt: now,
              message: `${cancelling ? 'Cancelled' : 'Rejected'}: ${reason}`,
            },
          },
        },
      });
      // Credit whatever isn't credited already (e.g. after a short-delivery credit).
      const credited = await tx.billingAdjustment.aggregate({
        where: { orderId: id },
        _sum: { amountCents: true },
      });
      const owed = order.totalCents + (credited._sum.amountCents ?? 0);
      if (order.invoiceId && owed > 0) {
        await tx.billingAdjustment.create({
          data: {
            companyId: order.companyId,
            orderId: id,
            amountCents: -owed,
            reason: cancelling ? 'CANCELLED_AFTER_INVOICE' : 'REJECTED_AFTER_INVOICE',
            note: reason,
            createdById: actor.id,
            createdAt: now,
          },
        });
        await tx.orderEvent.create({
          data: {
            orderId: id,
            type: 'CREDITED',
            actorId: actor.id,
            createdAt: now,
            message: `The order was already invoiced: a credit of ${formatCents(owed)} goes on the company’s next invoice.`,
          },
        });
      }
      if (order.dropId) await removeDropIfEmpty(tx, order.dropId);
    });
    return this.get(id, actor);
  }

  // ---------------------------------------------------------------------------------
  // Loading and mapping
  // ---------------------------------------------------------------------------------

  private async findEmployee(id: string): Promise<EmployeeForOrder> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: employeeForOrder,
    });
    if (!employee) throw new NotFoundError('Employee');
    return employee;
  }

  private async findForEdit(id: string): Promise<ExistingOrder> {
    const order = await this.prisma.order.findUnique({ where: { id }, include: editInclude });
    if (!order) throw new NotFoundError('Order');
    return order;
  }

  /** The dishes on the menu, with what they and their options cost (for the snapshots). */
  private async orderableDishes(dishes: MenuDishDto[]): Promise<Map<string, OrderableDish>> {
    const optionIds = [
      ...new Set(dishes.flatMap((d) => d.optionGroups.flatMap((g) => g.options.map((o) => o.id)))),
    ];
    const [dishRows, optionRows] = await Promise.all([
      this.prisma.dish.findMany({
        where: { id: { in: [...new Set(dishes.map((d) => d.dishId))] } },
        select: { id: true, sku: true, costCents: true },
      }),
      this.prisma.option.findMany({
        where: { id: { in: optionIds } },
        select: { id: true, costCents: true },
      }),
    ]);
    const optionCosts = new Map(optionRows.map((o) => [o.id, o.costCents]));
    const rows = new Map(dishRows.map((d) => [d.id, d]));
    const orderable = new Map<string, OrderableDish>();
    for (const dish of dishes) {
      const row = rows.get(dish.dishId);
      // The same dish can be in several categories; it is one orderable dish.
      if (row && !orderable.has(dish.dishId)) {
        orderable.set(dish.dishId, { dish, sku: row.sku, costCents: row.costCents, optionCosts });
      }
    }
    return orderable;
  }

  private toDetail(order: OrderWithDetails, actor: Actor, rules: KitchenRules): OrderDetailDto {
    const date = dbDateToIso(order.deliveryDate);
    const cutoffAt = isWorkingDay(date, rules.calendar)
      ? cutoffInstant(date, rules.calendar, rules.cutoff, rules.zone)
      : null;
    const locked = cutoffAt !== null && this.clock.now() >= cutoffAt;
    const allowed = (action: OrderAction) =>
      orderActionProblem(action, {
        status: order.status,
        locked,
        canWrite: actor.permissions.includes('ORDERS_WRITE'),
        canOverride: actor.permissions.includes('ORDERS_OVERRIDE'),
        outForDelivery: order.drop?.outForDeliveryAt != null,
      }) === null;
    const iso = (value: Date | null) => value?.toISOString() ?? null;

    return {
      id: order.id,
      number: order.number,
      status: order.status,
      version: order.version,
      deliveryDate: date,
      deliveryTimeMinutes: order.deliveryTimeMinutes,
      employee: {
        id: order.employee.id,
        name: `${order.employee.firstName} ${order.employee.lastName}`,
      },
      employeeEmail: order.employee.email,
      company: order.company,
      priceTier: order.priceTier,
      totalCents: order.totalCents,
      mealCount: order.lines.reduce((sum, line) => sum + line.quantity, 0),
      isInvoiced: order.invoiceId !== null,
      invoice: order.invoice,
      addressId: order.addressId,
      addressText: order.addressText,
      packagingTypeId: order.packagingTypeId,
      packagingName: order.packagingName,
      notes: order.notes,
      deliveryAt: order.deliveryAt.toISOString(),
      deliveryLeadMinutes: order.deliveryLeadMinutes,
      plannedDispatchReadyAt: order.plannedDispatchReadyAt.toISOString(),
      plannedKitchenReadyAt: order.plannedKitchenReadyAt.toISOString(),
      cutoffAt: iso(cutoffAt),
      isLocked: locked,
      placedAt: iso(order.placedAt),
      confirmedAt: iso(order.confirmedAt),
      cancelledAt: iso(order.cancelledAt),
      rejectedAt: iso(order.rejectedAt),
      statusReason: order.statusReason,
      kitchenStartedAt: iso(order.kitchenStartedAt),
      kitchenReadyAt: iso(order.kitchenReadyAt),
      createdAt: order.createdAt.toISOString(),
      lines: order.lines.map((line) => ({
        id: line.id,
        dishId: line.dishId,
        dishName: line.dishName,
        dishSku: line.dishSku,
        quantity: line.quantity,
        dishUnitPriceCents: line.dishUnitPriceCents,
        lineTotalCents: line.lineTotalCents,
        combinations: line.combinations.map((c) => ({
          id: c.id,
          quantity: c.quantity,
          unitPriceCents: c.unitPriceCents,
          totalCents: c.totalCents,
          kitchenStartedAt: iso(c.kitchenStartedAt),
          kitchenDoneAt: iso(c.kitchenDoneAt),
          options: c.options.map((o) => ({
            optionId: o.optionId,
            optionGroupId: o.optionGroupId,
            portionSizeId: o.portionSizeId,
            optionName: o.optionName,
            groupName: o.groupName,
            portionName: o.portionName,
            priceCents: o.priceCents,
          })),
        })),
      })),
      events: order.events.map((event) => ({
        id: event.id,
        type: event.type,
        message: event.message,
        actorName: event.actor?.name ?? null,
        createdAt: event.createdAt.toISOString(),
      })),
      allowed: {
        edit: allowed('EDIT'),
        place: allowed('PLACE'),
        cancel: allowed('CANCEL'),
        reject: allowed('REJECT'),
        changeDelivery: allowed('CHANGE_DELIVERY'),
      },
    };
  }
}

/** "FL-000123", "123" -> by number; anything else -> the employee's name or email. */
function searchFilter(search: string): Prisma.OrderWhereInput {
  const number = /^(?:FL-?)?0*(\d{1,9})$/i.exec(search);
  if (number) return { number: Number(number[1]) };
  return {
    employee: {
      OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search.toLowerCase() } },
      ],
    },
  };
}

function windowOf(settings: {
  deliveryWindowStartMinutes: number;
  deliveryWindowEndMinutes: number;
  deliverySlotMinutes: number;
}) {
  return {
    startMinutes: settings.deliveryWindowStartMinutes,
    endMinutes: settings.deliveryWindowEndMinutes,
    slotMinutes: settings.deliverySlotMinutes,
  };
}

function addressText(address: {
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  postcode: string;
}): string {
  const street = [address.line1, address.line2].filter(Boolean).join(', ');
  return `${address.label} - ${street}, ${address.city} ${address.postcode}`;
}

/** Locked prices of a placed order's combinations: kept when it is edited (README: price locking). */
function lockedPrices(
  existing: ExistingOrder | undefined,
): Map<string, Map<string, LockedCombination>> {
  const locked = new Map<string, Map<string, LockedCombination>>();
  if (existing?.status !== 'PLACED') return locked;
  for (const line of existing.lines) {
    locked.set(
      line.dishId,
      new Map(
        line.combinations.map((c) => [
          c.signature,
          {
            unitPriceCents: c.unitPriceCents,
            options: c.options.map((o) => ({
              optionId: o.optionId,
              optionGroupId: o.optionGroupId ?? '',
              portionSizeId: o.portionSizeId,
              optionName: o.optionName,
              groupName: o.groupName,
              portionName: o.portionName,
              priceCents: o.priceCents,
              costCents: o.costCents,
            })),
          },
        ]),
      ),
    );
  }
  return locked;
}

/** The order's own columns: snapshots of who, when, where, what tier, and the total. */
function headerFields(prepared: PreparedOrder, notes: string) {
  return {
    priceTierId: prepared.tier.id,
    deliveryDate: isoDateToDb(prepared.deliveryDate),
    deliveryTimeMinutes: prepared.deliveryTimeMinutes,
    addressId: prepared.address.id,
    addressText: prepared.address.text,
    packagingTypeId: prepared.packaging.id,
    packagingName: prepared.packaging.name,
    deliveryLeadMinutes: prepared.leadMinutes,
    ...prepared.planned,
    notes,
    totalCents: prepared.totalCents,
  };
}

/** Lines, combinations and choices with snapshots of names and prices (spec 4.1). */
function linesCreate(lines: PricedLine[]) {
  return lines.map((line, index) => ({
    dishId: line.dishId,
    sortOrder: index,
    quantity: line.quantity,
    dishName: line.dishName,
    dishSku: line.dishSku,
    dishUnitPriceCents: line.dishUnitPriceCents,
    dishUnitCostCents: line.dishUnitCostCents,
    lineTotalCents: line.lineTotalCents,
    combinations: {
      create: line.combinations.map((combination) => ({
        quantity: combination.quantity,
        signature: combination.signature,
        unitPriceCents: combination.unitPriceCents,
        totalCents: combination.totalCents,
        options: {
          create: combination.options.map((option) => ({
            optionId: option.optionId,
            optionGroupId: option.optionGroupId || null,
            portionSizeId: option.portionSizeId,
            optionName: option.optionName,
            groupName: option.groupName,
            portionName: option.portionName,
            priceCents: option.priceCents,
            costCents: option.costCents,
          })),
        },
      })),
    },
  }));
}

function describeOrder(prepared: PreparedOrder): string {
  const meals = prepared.lines.reduce((sum, line) => sum + line.quantity, 0);
  const date = DateTime.fromISO(prepared.deliveryDate).toFormat('ccc d LLL');
  return `${meals} meals for ${date} at ${minutesToTime(prepared.deliveryTimeMinutes)}, ${formatCents(prepared.totalCents)}`;
}
