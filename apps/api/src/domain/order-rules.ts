import type { OrderStatus } from '@fernleaf/shared';
import { zonedInstant, type IsoDate } from './calendar.js';

/**
 * Who may do what to an order, and when (spec 4.6), as one table:
 *
 *   action            allowed from          needs                                   after the cut-off
 *   edit              DRAFT, PLACED         ORDERS_WRITE                             ORDERS_OVERRIDE too
 *   place             DRAFT                 ORDERS_WRITE                             ORDERS_OVERRIDE too
 *   cancel            DRAFT, PLACED         ORDERS_WRITE                             ORDERS_OVERRIDE too
 *   cancel            CONFIRMED             ORDERS_OVERRIDE, not out for delivery
 *   reject            PLACED, CONFIRMED     ORDERS_OVERRIDE, not out for delivery
 *   change delivery   CONFIRMED             ORDERS_OVERRIDE, not out for delivery
 *
 * Confirming is not here: only cut-off processing confirms orders.
 */
export type OrderAction = 'EDIT' | 'PLACE' | 'CANCEL' | 'REJECT' | 'CHANGE_DELIVERY';

export interface OrderActionContext {
  status: OrderStatus;
  /** The delivery date's cut-off has passed. */
  locked: boolean;
  canWrite: boolean;
  canOverride: boolean;
  /** The order's drop has left the kitchen. */
  outForDelivery: boolean;
}

/** Why `action` isn't allowed right now, or null if it is. */
export function orderActionProblem(
  action: OrderAction,
  context: OrderActionContext,
): string | null {
  const { status, locked, canWrite, canOverride, outForDelivery } = context;
  const beforeConfirmation = status === 'DRAFT' || status === 'PLACED';
  const afterCutoff =
    'The cut-off for this delivery date has passed - only an admin can change it now.';
  const onTheRoad = 'The order is already out for delivery.';

  switch (action) {
    case 'EDIT':
    case 'PLACE':
    case 'CANCEL': {
      if (action === 'PLACE' && status !== 'DRAFT') return 'Only drafts can be placed.';
      if (action === 'CANCEL' && status === 'CONFIRMED') {
        if (!canOverride) return 'Only an admin can cancel a confirmed order.';
        return outForDelivery ? onTheRoad : null;
      }
      if (!beforeConfirmation) {
        return status === 'CONFIRMED'
          ? 'Confirmed orders can’t be edited. An admin can change the delivery details or cancel it.'
          : `The order is ${status.toLowerCase()}.`;
      }
      if (!canWrite) return 'Your role can’t change orders.';
      if (locked && !canOverride) return afterCutoff;
      return null;
    }
    case 'REJECT':
      if (status !== 'PLACED' && status !== 'CONFIRMED') {
        return 'Only placed or confirmed orders can be rejected.';
      }
      if (!canOverride) return 'Only an admin can reject an order.';
      return outForDelivery ? onTheRoad : null;
    case 'CHANGE_DELIVERY':
      if (status !== 'CONFIRMED')
        return 'Only confirmed orders have their delivery changed this way.';
      if (!canOverride) return 'Only an admin can change a confirmed order.';
      return outForDelivery ? onTheRoad : null;
  }
}

/** The kitchen must finish this long before the order has to leave (spec 4.7). */
export const KITCHEN_BUFFER_MINUTES = 30;

/**
 * Spec 4.7: worked back from the delivery time.
 *   dispatch-ready = delivery time - the company's lead minutes
 *   kitchen-ready  = dispatch-ready - 30 minutes
 */
export function plannedTimes(
  deliveryDate: IsoDate,
  deliveryTimeMinutes: number,
  leadMinutes: number,
  zone: string,
): { deliveryAt: Date; plannedDispatchReadyAt: Date; plannedKitchenReadyAt: Date } {
  const deliveryAt = zonedInstant(deliveryDate, deliveryTimeMinutes, zone);
  const plannedDispatchReadyAt = new Date(deliveryAt.getTime() - leadMinutes * 60_000);
  const plannedKitchenReadyAt = new Date(
    plannedDispatchReadyAt.getTime() - KITCHEN_BUFFER_MINUTES * 60_000,
  );
  return { deliveryAt, plannedDispatchReadyAt, plannedKitchenReadyAt };
}
