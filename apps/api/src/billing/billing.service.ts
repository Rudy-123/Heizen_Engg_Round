import { Injectable } from '@nestjs/common';
import {
  CREDIT_REASON_LABELS,
  formatCents,
  formatInvoiceNumber,
  formatOrderNumber,
  type BillableOrderDto,
  type BillingOverviewDto,
  type CompanyBillingDto,
  type CreateCreditInput,
  type CreateInvoiceInput,
  type CreditDto,
  type InvoiceDetailDto,
  type InvoiceListQuery,
  type InvoiceSummaryDto,
  type Page,
} from '@fernleaf/shared';
import { ClockService } from '../common/clock/clock.service.js';
import { dbDateToIso } from '../common/dates.js';
import { BusinessRuleError, ConflictError, NotFoundError } from '../common/errors/domain-error.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Billable = confirmed (or delivered) and not on an invoice yet (spec 4.9). */
const BILLABLE = {
  status: { in: ['CONFIRMED', 'DELIVERED'] },
  invoiceId: null,
} satisfies Prisma.OrderWhereInput;

const billableOrderSelect = {
  id: true,
  number: true,
  deliveryDate: true,
  status: true,
  totalCents: true,
  employee: { select: { firstName: true, lastName: true } },
  lines: { select: { quantity: true } },
} satisfies Prisma.OrderSelect;

const creditInclude = {
  order: { select: { number: true } },
  createdBy: { select: { name: true } },
  invoice: { select: { id: true, number: true } },
} satisfies Prisma.BillingAdjustmentInclude;

const invoiceSummaryInclude = {
  company: { select: { id: true, name: true } },
  _count: { select: { orders: true } },
} satisfies Prisma.InvoiceInclude;

interface Actor {
  id: string;
}

/**
 * Company billing (spec 4.9). Invoices are internal records: a company's confirmed orders
 * plus its pending credits, totals stored and reconciled (a CHECK constraint makes
 * total = orders + credits). Once issued an invoice never changes; later corrections are
 * credits that go on the next one.
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  /** Per company: what is waiting to be invoiced, pending credits, and unpaid invoices. */
  async overview(): Promise<BillingOverviewDto> {
    const [companies, uninvoiced, credits, unpaid] = await Promise.all([
      this.prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.order.groupBy({
        by: ['companyId'],
        where: BILLABLE,
        _count: { _all: true },
        _sum: { totalCents: true },
        _min: { deliveryDate: true },
      }),
      this.prisma.billingAdjustment.groupBy({
        by: ['companyId'],
        where: { invoiceId: null },
        _sum: { amountCents: true },
      }),
      this.prisma.invoice.groupBy({
        by: ['companyId'],
        where: { status: 'ISSUED' },
        _count: { _all: true },
        _sum: { totalCents: true },
        _min: { issuedAt: true },
      }),
    ]);
    const rows = companies.map((company) => {
      const open = uninvoiced.find((u) => u.companyId === company.id);
      const credit = credits.find((c) => c.companyId === company.id);
      const owed = unpaid.find((u) => u.companyId === company.id);
      return {
        company,
        uninvoicedOrders: open?._count._all ?? 0,
        uninvoicedCents: open?._sum.totalCents ?? 0,
        pendingCreditsCents: credit?._sum.amountCents ?? 0,
        oldestUninvoicedDate: open?._min.deliveryDate ? dbDateToIso(open._min.deliveryDate) : null,
        unpaidInvoices: owed?._count._all ?? 0,
        unpaidCents: owed?._sum.totalCents ?? 0,
        oldestUnpaidIssuedAt: owed?._min.issuedAt?.toISOString() ?? null,
      };
    });
    // Most money waiting first; companies with nothing going on last, by name.
    rows.sort(
      (a, b) =>
        b.uninvoicedCents + b.unpaidCents - (a.uninvoicedCents + a.unpaidCents) ||
        a.company.name.localeCompare(b.company.name),
    );
    return {
      companies: rows,
      totals: {
        uninvoicedCents: rows.reduce((sum, r) => sum + r.uninvoicedCents, 0),
        pendingCreditsCents: rows.reduce((sum, r) => sum + r.pendingCreditsCents, 0),
        unpaidCents: rows.reduce((sum, r) => sum + r.unpaidCents, 0),
      },
    };
  }

  /** What can go on a company's next invoice, and its invoices so far. */
  async company(companyId: string): Promise<CompanyBillingDto> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        billingContactName: true,
        billingEmail: true,
        billingAddress: true,
      },
    });
    if (!company) throw new NotFoundError('Company');
    const [orders, credits, invoices] = await Promise.all([
      this.prisma.order.findMany({
        where: { ...BILLABLE, companyId },
        orderBy: [{ deliveryDate: 'asc' }, { number: 'asc' }],
        select: billableOrderSelect,
      }),
      this.prisma.billingAdjustment.findMany({
        where: { companyId, invoiceId: null },
        orderBy: { createdAt: 'asc' },
        include: creditInclude,
      }),
      this.prisma.invoice.findMany({
        where: { companyId },
        orderBy: { number: 'desc' },
        take: 50,
        include: invoiceSummaryInclude,
      }),
    ]);
    return {
      company,
      orders: orders.map(toBillableOrder),
      pendingCredits: credits.map(toCredit),
      invoices: invoices.map(toInvoiceSummary),
    };
  }

  async listInvoices(query: InvoiceListQuery): Promise<Page<InvoiceSummaryDto>> {
    const where: Prisma.InvoiceWhereInput = {
      ...(query.status !== 'all' ? { status: query.status } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
    };
    const [total, invoices] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        orderBy: { number: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: invoiceSummaryInclude,
      }),
    ]);
    return {
      items: invoices.map(toInvoiceSummary),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async invoice(id: string): Promise<InvoiceDetailDto> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        ...invoiceSummaryInclude,
        company: {
          select: {
            id: true,
            name: true,
            billingContactName: true,
            billingEmail: true,
            billingPhone: true,
            billingAddress: true,
          },
        },
        issuedBy: { select: { name: true } },
        paidBy: { select: { name: true } },
        orders: {
          orderBy: [{ deliveryDate: 'asc' }, { number: 'asc' }],
          select: billableOrderSelect,
        },
        adjustments: { orderBy: { createdAt: 'asc' }, include: creditInclude },
      },
    });
    if (!invoice) throw new NotFoundError('Invoice');
    return {
      ...toInvoiceSummary(invoice),
      company: { id: invoice.company.id, name: invoice.company.name },
      billTo: {
        contactName: invoice.company.billingContactName,
        email: invoice.company.billingEmail,
        phone: invoice.company.billingPhone,
        address: invoice.company.billingAddress,
      },
      issuedByName: invoice.issuedBy?.name ?? null,
      paidByName: invoice.paidBy?.name ?? null,
      orders: invoice.orders.map(toBillableOrder),
      adjustments: invoice.adjustments.map(toCredit),
    };
  }

  /**
   * Groups the chosen orders, plus every pending credit, into a new invoice. One transaction:
   * invoices for one company are created one at a time (a lock per company), and each order
   * is claimed with a conditional update - "only if it is still billable and on no invoice".
   * If any order was invoiced, cancelled or changed meanwhile, nothing is saved (409).
   */
  async createInvoice(input: CreateInvoiceInput, actor: Actor): Promise<InvoiceDetailDto> {
    const orderIds = [...new Set(input.orderIds)];
    const now = this.clock.now();
    const invoiceId = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invoice:${input.companyId}`}))`;
      const company = await tx.company.findUnique({
        where: { id: input.companyId },
        select: { id: true },
      });
      if (!company) throw new NotFoundError('Company');

      const orders = await tx.order.findMany({
        where: { id: { in: orderIds } },
        select: {
          id: true,
          number: true,
          companyId: true,
          status: true,
          invoiceId: true,
          totalCents: true,
          deliveryDate: true,
        },
      });
      const foreign = orderIds.length - orders.filter((o) => o.companyId === company.id).length;
      if (foreign > 0) {
        throw new BusinessRuleError(
          'ORDER_NOT_BILLABLE',
          'Some of the chosen orders aren’t this company’s orders.',
        );
      }
      const invoiced = orders.filter((o) => o.invoiceId !== null);
      if (invoiced.length > 0) {
        throw new ConflictError(
          `${invoiced.map((o) => formatOrderNumber(o.number)).join(', ')} ${invoiced.length === 1 ? 'is' : 'are'} already on an invoice.`,
          'ALREADY_INVOICED',
        );
      }
      const notBillable = orders.filter(
        (o) => o.status !== 'CONFIRMED' && o.status !== 'DELIVERED',
      );
      if (notBillable.length > 0) {
        throw new BusinessRuleError(
          'ORDER_NOT_BILLABLE',
          `Only confirmed or delivered orders are billed: ${notBillable.map((o) => formatOrderNumber(o.number)).join(', ')} ${notBillable.length === 1 ? 'is' : 'are'} not.`,
        );
      }

      const credits = await tx.billingAdjustment.findMany({
        where: { companyId: company.id, invoiceId: null },
        select: { id: true, amountCents: true },
      });
      if (orders.length === 0 && credits.length === 0) {
        throw new BusinessRuleError('NOTHING_TO_INVOICE', 'Choose at least one order to invoice.');
      }
      const ordersTotalCents = orders.reduce((sum, o) => sum + o.totalCents, 0);
      const adjustmentsTotalCents = credits.reduce((sum, c) => sum + c.amountCents, 0);
      const dates = orders.map((o) => o.deliveryDate.getTime()).sort((a, b) => a - b);
      const invoice = await tx.invoice.create({
        data: {
          companyId: company.id,
          status: 'ISSUED',
          periodStart: dates.length > 0 ? new Date(dates[0] ?? 0) : null,
          periodEnd: dates.length > 0 ? new Date(dates.at(-1) ?? 0) : null,
          ordersTotalCents,
          adjustmentsTotalCents,
          totalCents: ordersTotalCents + adjustmentsTotalCents,
          issuedAt: now,
          issuedById: actor.id,
        },
      });

      // The claim. Bumping the version also stops anyone still editing from an older copy.
      const claimed = await tx.order.updateMany({
        where: { id: { in: orderIds }, ...BILLABLE },
        data: { invoiceId: invoice.id, version: { increment: 1 } },
      });
      if (claimed.count !== orderIds.length) {
        throw new ConflictError(
          'Some of these orders were invoiced or changed a moment ago. Reload and try again.',
          'ORDERS_CHANGED',
        );
      }
      await tx.billingAdjustment.updateMany({
        where: { id: { in: credits.map((c) => c.id) }, invoiceId: null },
        data: { invoiceId: invoice.id },
      });
      const label = formatInvoiceNumber(invoice.number);
      await tx.orderEvent.createMany({
        data: orders.map((order) => ({
          orderId: order.id,
          type: 'INVOICED' as const,
          actorId: actor.id,
          message: `Invoiced on ${label}.`,
          createdAt: now,
        })),
      });
      return invoice.id;
    });
    return this.invoice(invoiceId);
  }

  /** ISSUED -> PAID, once. */
  async markPaid(id: string, actor: Actor): Promise<InvoiceDetailDto> {
    const { count } = await this.prisma.invoice.updateMany({
      where: { id, status: 'ISSUED' },
      data: { status: 'PAID', paidAt: this.clock.now(), paidById: actor.id },
    });
    if (count === 0) {
      const exists = await this.prisma.invoice.count({ where: { id } });
      if (!exists) throw new NotFoundError('Invoice');
      throw new ConflictError('This invoice is already marked paid.', 'ALREADY_PAID');
    }
    return this.invoice(id);
  }

  /**
   * A credit an admin records after confirmation, e.g. a delivery that turned out short.
   * The order itself never changes price; the credit goes on the company's next invoice.
   * Credits on one order never add up to more than the order's total.
   */
  async createCredit(input: CreateCreditInput, actor: Actor): Promise<CreditDto> {
    const now = this.clock.now();
    const creditId = await this.prisma.$transaction(async (tx) => {
      // Two credits for the same order at once take turns.
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;
      if (rows.length === 0) throw new NotFoundError('Order');
      const order = await tx.order.findUniqueOrThrow({
        where: { id: input.orderId },
        select: { id: true, companyId: true, status: true, totalCents: true },
      });
      if (order.status !== 'CONFIRMED' && order.status !== 'DELIVERED') {
        throw new BusinessRuleError(
          'ORDER_NOT_BILLABLE',
          'Only confirmed or delivered orders can be credited - a cancelled or rejected order isn’t billed at all.',
        );
      }
      const existing = await tx.billingAdjustment.aggregate({
        where: { orderId: order.id },
        _sum: { amountCents: true },
      });
      const remaining = order.totalCents + (existing._sum.amountCents ?? 0);
      if (input.amountCents > remaining) {
        throw new BusinessRuleError('CREDIT_TOO_LARGE', 'The credit is too large.', [
          {
            path: 'amountCents',
            message:
              remaining > 0
                ? `At most ${formatCents(remaining)} - the rest of this order is already credited.`
                : 'This order is already fully credited.',
          },
        ]);
      }
      const credit = await tx.billingAdjustment.create({
        data: {
          companyId: order.companyId,
          orderId: order.id,
          amountCents: -input.amountCents,
          reason: input.reason,
          note: input.note,
          createdById: actor.id,
          createdAt: now,
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: 'CREDITED',
          actorId: actor.id,
          message: `Credit of ${formatCents(input.amountCents)} (${CREDIT_REASON_LABELS[input.reason].toLowerCase()}): ${input.note}. It goes on the company’s next invoice.`,
          createdAt: now,
        },
      });
      return credit.id;
    });
    const credit = await this.prisma.billingAdjustment.findUniqueOrThrow({
      where: { id: creditId },
      include: creditInclude,
    });
    return toCredit(credit);
  }
}

type BillableOrder = Prisma.OrderGetPayload<{ select: typeof billableOrderSelect }>;
type Credit = Prisma.BillingAdjustmentGetPayload<{ include: typeof creditInclude }>;
type InvoiceSummary = Prisma.InvoiceGetPayload<{ include: typeof invoiceSummaryInclude }>;

function toBillableOrder(order: BillableOrder): BillableOrderDto {
  return {
    id: order.id,
    number: order.number,
    deliveryDate: dbDateToIso(order.deliveryDate),
    employeeName: `${order.employee.firstName} ${order.employee.lastName}`,
    // Invoiced orders cancelled later keep their place on the invoice (and get a credit).
    status: order.status as BillableOrderDto['status'],
    mealCount: order.lines.reduce((sum, line) => sum + line.quantity, 0),
    totalCents: order.totalCents,
  };
}

function toCredit(credit: Credit): CreditDto {
  return {
    id: credit.id,
    orderId: credit.orderId,
    orderNumber: credit.order.number,
    amountCents: credit.amountCents,
    reason: credit.reason,
    note: credit.note,
    createdAt: credit.createdAt.toISOString(),
    createdByName: credit.createdBy?.name ?? null,
    invoice: credit.invoice,
  };
}

function toInvoiceSummary(invoice: InvoiceSummary): InvoiceSummaryDto {
  return {
    id: invoice.id,
    number: invoice.number,
    company: invoice.company,
    status: invoice.status,
    periodStart: invoice.periodStart ? dbDateToIso(invoice.periodStart) : null,
    periodEnd: invoice.periodEnd ? dbDateToIso(invoice.periodEnd) : null,
    orderCount: invoice._count.orders,
    ordersTotalCents: invoice.ordersTotalCents,
    adjustmentsTotalCents: invoice.adjustmentsTotalCents,
    totalCents: invoice.totalCents,
    issuedAt: invoice.issuedAt.toISOString(),
    paidAt: invoice.paidAt?.toISOString() ?? null,
  };
}
