import { minutesToTime } from '@fernleaf/shared';

/**
 * Delivery times people can pick (settings: "from 07:00 to 21:00, every 15 minutes").
 * Used for a company's default delivery time and for the time on an order.
 */
export interface DeliveryWindow {
  /** Minutes since midnight. */
  startMinutes: number;
  endMinutes: number;
  slotMinutes: number;
}

/** Why `minutes` isn't a delivery time on offer, or null if it is. */
export function deliveryTimeProblem(minutes: number, window: DeliveryWindow): string | null {
  const range = `${minutesToTime(window.startMinutes)}–${minutesToTime(window.endMinutes)}`;
  if (minutes < window.startMinutes || minutes > window.endMinutes) {
    return `Deliveries run ${range}.`;
  }
  if ((minutes - window.startMinutes) % window.slotMinutes !== 0) {
    return `Pick a time on the ${window.slotMinutes}-minute grid (${range}).`;
  }
  return null;
}
