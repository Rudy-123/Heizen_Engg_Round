import { z } from 'zod';
import { pageQuerySchema } from './pagination.js';

/**
 * Company billing (spec 4.9). Every confirmed order is owed in full by its company. Staff
 * group a company's uninvoiced orders into an invoice (an internal record) and mark it paid.
 *
 * Policy for orders that change after invoicing: issued invoices never change. A cancelled
 * or rejected invoiced order gets an automatic full credit, and a short delivery gets a
 * credit an admin records; credits go on the company's next invoice.
 */

export const INVOICE_STATUSES = ['ISSUED', 'PAID'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const CREDIT_REASONS = [
  'CANCELLED_AFTER_INVOICE',
  'REJECTED_AFTER_INVOICE',
  'SHORT_DELIVERY',
  'OTHER',
] as const;
export type CreditReason = (typeof CREDIT_REASONS)[number];

export const CREDIT_REASON_LABELS: Record<CreditReason, string> = {
  CANCELLED_AFTER_INVOICE: 'Cancelled after invoicing',
  REJECTED_AFTER_INVOICE: 'Rejected after invoicing',
  SHORT_DELIVERY: 'Short delivery',
  OTHER: 'Other',
};

/** 7 -> "INV-0007" */
export function formatInvoiceNumber(number: number): string {
  return `INV-${String(number).padStart(4, '0')}`;
}

/** Body of POST /api/billing/invoices. The company's pending credits are always included. */
export const createInvoiceSchema = z.object({
  companyId: z.string().min(1),
  orderIds: z.array(z.string().min(1)).max(5000),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

/** Body of POST /api/billing/credits: a credit an admin records, e.g. for a short delivery. */
export const createCreditSchema = z.object({
  orderId: z.string().min(1),
  amountCents: z
    .number({ message: 'Enter an amount.' })
    .int({ message: 'Use whole cents.' })
    .min(1, { message: 'Enter more than $0.' }),
  reason: z.enum(['SHORT_DELIVERY', 'OTHER']),
  note: z.string().trim().min(1, { message: 'Say what happened.' }).max(300),
});
export type CreateCreditInput = z.infer<typeof createCreditSchema>;

export const invoiceListQuerySchema = pageQuerySchema.extend({
  status: z.enum(['ISSUED', 'PAID', 'all']).default('all'),
  companyId: z.string().min(1).optional(),
});
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

interface NamedRef {
  id: string;
  name: string;
}

/** One company on the billing overview. */
export interface CompanyBillingSummaryDto {
  company: NamedRef;
  uninvoicedOrders: number;
  uninvoicedCents: number;
  /** Credits waiting for the next invoice (negative, or 0). */
  pendingCreditsCents: number;
  oldestUninvoicedDate: string | null;
  unpaidInvoices: number;
  unpaidCents: number;
  /** Issued date of the oldest unpaid invoice. */
  oldestUnpaidIssuedAt: string | null;
}

export interface BillingOverviewDto {
  companies: CompanyBillingSummaryDto[];
  totals: { uninvoicedCents: number; pendingCreditsCents: number; unpaidCents: number };
}

export interface BillableOrderDto {
  id: string;
  number: number;
  deliveryDate: string;
  employeeName: string;
  status: 'CONFIRMED' | 'DELIVERED' | 'CANCELLED' | 'REJECTED';
  mealCount: number;
  totalCents: number;
}

export interface CreditDto {
  id: string;
  orderId: string;
  orderNumber: number;
  /** Negative: money back to the company. */
  amountCents: number;
  reason: CreditReason;
  note: string;
  createdAt: string;
  createdByName: string | null;
  invoice: { id: string; number: number } | null;
}

export interface InvoiceSummaryDto {
  id: string;
  number: number;
  company: NamedRef;
  status: InvoiceStatus;
  periodStart: string | null;
  periodEnd: string | null;
  orderCount: number;
  ordersTotalCents: number;
  adjustmentsTotalCents: number;
  totalCents: number;
  issuedAt: string;
  paidAt: string | null;
}

export interface InvoiceDetailDto extends InvoiceSummaryDto {
  billTo: { contactName: string; email: string; phone: string | null; address: string };
  issuedByName: string | null;
  paidByName: string | null;
  orders: BillableOrderDto[];
  adjustments: CreditDto[];
}

/** GET /api/billing/companies/:id - what can go on the company's next invoice. */
export interface CompanyBillingDto {
  company: NamedRef & {
    billingContactName: string;
    billingEmail: string;
    billingAddress: string;
  };
  /** Confirmed and delivered orders not on any invoice yet, oldest first. */
  orders: BillableOrderDto[];
  /** Credits waiting for the next invoice. */
  pendingCredits: CreditDto[];
  invoices: InvoiceSummaryDto[];
}
