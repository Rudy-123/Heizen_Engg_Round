import { z } from 'zod';
import type { MenuPreviewDto } from './menu.js';
import { pageQuerySchema } from './pagination.js';
import { timeOfDaySchema } from './settings.js';

/**
 * Orders (spec 4.6). Staff create orders for employees. An order line is one dish; its
 * quantity is split into combinations of option choices (spec 4.1), and each combination is
 * one prep unit for the kitchen.
 */

export const ORDER_STATUSES = [
  'DRAFT',
  'PLACED',
  'CONFIRMED',
  'DELIVERED',
  'CANCELLED',
  'REJECTED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: 'Draft',
  PLACED: 'Placed',
  CONFIRMED: 'Confirmed',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
};

/** 123 -> "FL-000123" */
export function formatOrderNumber(number: number): string {
  return `FL-${String(number).padStart(6, '0')}`;
}

const choiceSchema = z.object({
  groupId: z.string().min(1),
  optionId: z.string().min(1),
  /** Portioned groups only: the size this option is picked in. */
  portionSizeId: z.string().min(1).nullable().default(null),
});

const combinationSchema = z.object({
  quantity: z
    .number({ message: 'Enter a quantity.' })
    .int({ message: 'Use whole meals.' })
    .min(1, { message: 'At least 1.' })
    .max(1000),
  choices: z.array(choiceSchema).max(30).default([]),
});

const lineSchema = z.object({
  dishId: z.string().min(1),
  quantity: z
    .number({ message: 'Enter a quantity.' })
    .int({ message: 'Use whole meals.' })
    .min(1, { message: 'At least 1.' })
    .max(1000),
  combinations: z
    .array(combinationSchema)
    .min(1, { message: 'Add at least one combination.' })
    .max(50),
});

export type OrderChoiceInput = z.infer<typeof choiceSchema>;
export type OrderCombinationInput = z.infer<typeof combinationSchema>;
export type OrderLineInput = z.infer<typeof lineSchema>;

/** What an order is: when, where, how it's packed, and what's in it. */
export const orderContentSchema = z.object({
  deliveryDate: z.iso.date({ message: 'Pick a delivery date.' }),
  /** Null = the company's default delivery time. */
  deliveryTimeMinutes: timeOfDaySchema.nullable().default(null),
  /** Null = the company's default address. */
  addressId: z.string().min(1).nullable().default(null),
  /** Null = the company's default packaging. */
  packagingTypeId: z.string().min(1).nullable().default(null),
  notes: z.string().trim().max(500).default(''),
  lines: z.array(lineSchema).min(1, { message: 'Add at least one dish.' }).max(30),
});

/** Body of POST /api/orders: save as a draft, or place it straight away. */
export const createOrderSchema = orderContentSchema.extend({
  employeeId: z.string().min(1, { message: 'Pick an employee.' }),
  place: z.boolean().default(false),
});

/** Body of PUT /api/orders/:id - `version` must match, so two people can't overwrite each other. */
export const updateOrderSchema = orderContentSchema.extend({ version: z.number().int().min(0) });

/** Body of POST /api/orders/quote: prices an order without saving it. */
export const quoteOrderSchema = orderContentSchema.extend({
  employeeId: z.string().min(1, { message: 'Pick an employee.' }),
  /** When editing a placed order: its existing combinations keep their locked prices. */
  orderId: z.string().min(1).optional(),
});

/** Body of state changes (place, ...): the version the person was looking at. */
export const orderVersionSchema = z.object({ version: z.number().int().min(0) });

/** Body of cancel and reject. */
export const orderReasonSchema = orderVersionSchema.extend({
  reason: z.string().trim().min(3, { message: 'Say why, in a few words.' }).max(300),
});

/** Body of PUT /api/orders/:id/delivery - an admin changing a confirmed order (spec 4.6). */
export const deliveryOverrideSchema = orderVersionSchema.extend({
  deliveryTimeMinutes: timeOfDaySchema,
  addressId: z.string().min(1, { message: 'Pick an address.' }),
  packagingTypeId: z.string().min(1, { message: 'Pick packaging.' }),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type QuoteOrderInput = z.infer<typeof quoteOrderSchema>;
export type OrderContentInput = z.infer<typeof orderContentSchema>;
export type DeliveryOverrideInput = z.infer<typeof deliveryOverrideSchema>;

export const orderListQuerySchema = pageQuerySchema.extend({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  /** Comma-separated, e.g. "PLACED,CONFIRMED". */
  status: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',') : []))
    .pipe(z.array(z.enum(ORDER_STATUSES))),
  companyId: z.string().min(1).optional(),
  invoiced: z.enum(['yes', 'no', 'all']).default('all'),
  /** An order number ("FL-000123" or "123") or part of the employee's name or email. */
  search: z.string().trim().max(80).optional(),
});

export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

interface NamedRef {
  id: string;
  name: string;
}

export interface OrderSummaryDto {
  id: string;
  number: number;
  status: OrderStatus;
  /** YYYY-MM-DD */
  deliveryDate: string;
  deliveryTimeMinutes: number;
  employee: NamedRef;
  company: NamedRef;
  totalCents: number;
  /** Total meals across all lines. */
  mealCount: number;
  isInvoiced: boolean;
}

export interface OrderOptionDto {
  optionId: string;
  optionGroupId: string | null;
  portionSizeId: string | null;
  optionName: string;
  groupName: string;
  portionName: string | null;
  priceCents: number;
}

export interface OrderCombinationDto {
  id: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  options: OrderOptionDto[];
  kitchenStartedAt: string | null;
  kitchenDoneAt: string | null;
}

export interface OrderLineDto {
  id: string;
  dishId: string;
  dishName: string;
  dishSku: string;
  quantity: number;
  dishUnitPriceCents: number;
  lineTotalCents: number;
  combinations: OrderCombinationDto[];
}

export interface OrderEventDto {
  id: string;
  type: string;
  message: string;
  /** Null when the system did it (e.g. automatic cut-off processing). */
  actorName: string | null;
  createdAt: string;
}

/** What the person looking at the order may do with it right now. */
export interface OrderActionsDto {
  edit: boolean;
  place: boolean;
  cancel: boolean;
  reject: boolean;
  changeDelivery: boolean;
}

export interface OrderDetailDto extends OrderSummaryDto {
  version: number;
  employeeEmail: string;
  priceTier: NamedRef;
  addressId: string;
  addressText: string;
  packagingTypeId: string;
  packagingName: string;
  notes: string;
  deliveryAt: string;
  deliveryLeadMinutes: number;
  plannedDispatchReadyAt: string;
  plannedKitchenReadyAt: string;
  /** When orders for this delivery date lock (null if the kitchen is closed that day). */
  cutoffAt: string | null;
  isLocked: boolean;
  placedAt: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  rejectedAt: string | null;
  statusReason: string | null;
  kitchenStartedAt: string | null;
  kitchenReadyAt: string | null;
  invoice: { id: string; number: number } | null;
  lines: OrderLineDto[];
  events: OrderEventDto[];
  allowed: OrderActionsDto;
  createdAt: string;
}

export interface QuoteCombinationDto {
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  /** True when this combination keeps the price it was placed at. */
  lockedPrice: boolean;
  options: {
    optionName: string;
    groupName: string;
    portionName: string | null;
    priceCents: number;
  }[];
}

export interface QuoteLineDto {
  dishId: string;
  dishName: string;
  quantity: number;
  dishUnitPriceCents: number;
  lineTotalCents: number;
  combinations: QuoteCombinationDto[];
}

/** POST /api/orders/quote: the price breakdown per line, and the order total. */
export interface OrderQuoteDto {
  lines: QuoteLineDto[];
  totalCents: number;
  tier: NamedRef;
}

/** One delivery date as the order form offers it. */
export interface DeliveryDateOptionDto {
  /** YYYY-MM-DD */
  date: string;
  /** Why the date can't be used at all (kitchen or company closed...). Empty when it can. */
  problems: string[];
  /** When orders for it lock; null when the kitchen is closed. */
  cutoffAt: string | null;
  /** Past the cut-off: only someone with the override permission can still place orders. */
  isLocked: boolean;
}

/** GET /api/orders/form-context?employeeId= : everything the order form needs for one employee. */
export interface OrderFormContextDto {
  employee: {
    id: string;
    name: string;
    email: string;
    company: NamedRef;
    canChooseAddress: boolean;
    canChangeDeliveryTime: boolean;
    canChangePackaging: boolean;
    allergies: NamedRef[];
  };
  defaults: {
    deliveryTimeMinutes: number;
    addressId: string | null;
    packagingTypeId: string | null;
  };
  addresses: { id: string; label: string; text: string }[];
  packagingTypes: NamedRef[];
  /** Delivery times on offer, minutes since midnight. */
  deliveryTimes: number[];
  deliveryDates: DeliveryDateOptionDto[];
  menu: MenuPreviewDto;
}

// ---------------------------------------------------------------------------
// Cut-off processing (spec 4.6)
// ---------------------------------------------------------------------------

export interface CutoffRunDto {
  id: string;
  /** YYYY-MM-DD */
  deliveryDate: string;
  trigger: 'AUTOMATIC' | 'MANUAL';
  /** Who pressed "Run now"; null for automatic runs. */
  actorName: string | null;
  cancelledCount: number;
  confirmedCount: number;
  ranAt: string;
}

/** One delivery date on the Cut-offs page. */
export interface CutoffDayDto {
  /** YYYY-MM-DD */
  date: string;
  kitchenOpen: boolean;
  cutoffAt: string | null;
  isLocked: boolean;
  counts: Record<'DRAFT' | 'PLACED' | 'CONFIRMED' | 'DELIVERED' | 'CANCELLED' | 'REJECTED', number>;
  /** Locked, with drafts or placed orders still waiting: processing is due. */
  isDue: boolean;
  lastRun: CutoffRunDto | null;
}

export interface CutoffOverviewDto {
  autoProcessing: boolean;
  days: CutoffDayDto[];
  recentRuns: CutoffRunDto[];
}
