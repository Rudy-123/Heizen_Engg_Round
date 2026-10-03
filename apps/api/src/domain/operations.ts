import type { DropStage, KitchenRisk } from '@fernleaf/shared';

/**
 * Pure rules for the kitchen and dispatch boards (spec 4.7, 4.8). No database, no clock:
 * the services pass "now" in, so tests can check any moment.
 */

/**
 * Late = not kitchen ready and the planned kitchen-ready time has passed.
 * At risk = not ready yet and the planned time is less than `atRiskMinutes` away.
 */
export function kitchenRisk(
  order: { kitchenReadyAt: Date | null; plannedKitchenReadyAt: Date },
  now: Date,
  atRiskMinutes: number,
): KitchenRisk {
  if (order.kitchenReadyAt) return 'READY';
  const planned = order.plannedKitchenReadyAt.getTime();
  if (now.getTime() > planned) return 'LATE';
  if (now.getTime() >= planned - atRiskMinutes * 60_000) return 'AT_RISK';
  return 'ON_TRACK';
}

export interface DropProgress {
  dispatchReadyAt: Date | null;
  outForDeliveryAt: Date | null;
  deliveredAt: Date | null;
  driverId: string | null;
  /** Orders travelling in the drop (confirmed or delivered), and how many are kitchen ready. */
  orders: number;
  ordersReady: number;
}

/** Where a drop is: the last step it reached. Kitchen ready = every order in it is ready. */
export function dropStage(drop: DropProgress): DropStage {
  if (drop.deliveredAt) return 'DELIVERED';
  if (drop.outForDeliveryAt) return 'OUT_FOR_DELIVERY';
  if (drop.dispatchReadyAt) return 'DISPATCH_READY';
  return drop.orders > 0 && drop.ordersReady === drop.orders ? 'KITCHEN_READY' : 'AWAITING_KITCHEN';
}

export type DropStep = 'DISPATCH_READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED';

export interface StepProblem {
  /** REPEATED: the step already happened (409). OUT_OF_ORDER: an earlier step is missing (422). */
  kind: 'REPEATED' | 'OUT_OF_ORDER';
  message: string;
}

/**
 * Spec 4.8: each step needs the one before and can't be repeated; "out for delivery" also
 * needs a driver. Returns why a step can't happen, or null when it can.
 */
export function dropStepProblem(step: DropStep, drop: DropProgress): StepProblem | null {
  switch (step) {
    case 'DISPATCH_READY':
      if (drop.dispatchReadyAt) {
        return { kind: 'REPEATED', message: 'This drop is already marked dispatch ready.' };
      }
      if (drop.orders === 0) {
        return { kind: 'OUT_OF_ORDER', message: 'This drop has no orders to send.' };
      }
      if (drop.ordersReady < drop.orders) {
        const waiting = drop.orders - drop.ordersReady;
        return {
          kind: 'OUT_OF_ORDER',
          message: `${waiting} of its ${drop.orders} orders ${waiting === 1 ? 'is' : 'are'} still in the kitchen.`,
        };
      }
      return null;
    case 'OUT_FOR_DELIVERY':
      if (drop.outForDeliveryAt) {
        return { kind: 'REPEATED', message: 'This drop is already out for delivery.' };
      }
      if (!drop.dispatchReadyAt) {
        return { kind: 'OUT_OF_ORDER', message: 'Mark it dispatch ready first.' };
      }
      if (!drop.driverId) {
        return { kind: 'OUT_OF_ORDER', message: 'Assign a driver first.' };
      }
      return null;
    case 'DELIVERED':
      if (drop.deliveredAt) {
        return { kind: 'REPEATED', message: 'This drop is already delivered.' };
      }
      if (!drop.outForDeliveryAt) {
        return { kind: 'OUT_OF_ORDER', message: 'It hasn’t gone out for delivery yet.' };
      }
      return null;
  }
}

/** On time = delivered no later than the agreed delivery time plus the grace minutes (a setting). */
export function deliveredOnTime(
  deliveredAt: Date,
  deliveryAt: Date,
  graceMinutes: number,
): boolean {
  return deliveredAt.getTime() <= deliveryAt.getTime() + graceMinutes * 60_000;
}
