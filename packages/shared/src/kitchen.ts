import { z } from 'zod';

/**
 * Kitchen board (spec 4.7). Each distinct combination on an order line is one prep unit,
 * routed to its dish's kitchen station (or "Unassigned"). Only confirmed orders are worked on.
 * The board never shows money.
 */

export const boardDateQuerySchema = z.object({
  date: z.iso.date({ message: 'Use a date like 2026-10-07.' }),
});
export type BoardDateQuery = z.infer<typeof boardDateQuerySchema>;

/**
 * Where an order stands against its planned kitchen-ready time:
 * READY - every unit done; LATE - not ready and the planned time has passed;
 * AT_RISK - not ready and the planned time is within the "at risk" window (a setting).
 */
export type KitchenRisk = 'READY' | 'LATE' | 'AT_RISK' | 'ON_TRACK';

export interface KitchenUnitDto {
  id: string;
  dishName: string;
  /** The dish's current station; null = Unassigned. */
  stationId: string | null;
  quantity: number;
  /** e.g. ["Paneer", "Brown rice (Large)"] */
  choices: string[];
  /** Every allergen in this unit (the dish's and the chosen options'). */
  allergens: string[];
  /** Allergens in this unit that the employee has recorded as allergies. */
  allergyConflicts: string[];
  startedAt: string | null;
  startedByName: string | null;
  doneAt: string | null;
  doneByName: string | null;
}

export interface KitchenOrderDto {
  id: string;
  number: number;
  status: 'CONFIRMED' | 'DELIVERED';
  employeeName: string;
  companyName: string;
  deliveryTimeMinutes: number;
  packagingName: string;
  notes: string;
  plannedKitchenReadyAt: string;
  plannedDispatchReadyAt: string;
  kitchenStartedAt: string | null;
  kitchenReadyAt: string | null;
  risk: KitchenRisk;
  units: KitchenUnitDto[];
}

export interface KitchenStationSummaryDto {
  /** null = Unassigned (dishes with no station). */
  id: string | null;
  name: string;
  units: number;
  meals: number;
  notStarted: number;
  inProgress: number;
  done: number;
}

/** What to batch-cook: meals per dish, split by combination of choices. */
export interface ProductionLineDto {
  dishName: string;
  stationId: string | null;
  meals: number;
  mealsDone: number;
  combinations: { choices: string[]; meals: number }[];
}

export interface KitchenBoardDto {
  date: string;
  /** The server's clock when the board was built; late and at-risk are worked out from it. */
  now: string;
  atRiskMinutes: number;
  stations: KitchenStationSummaryDto[];
  /** Confirmed and delivered orders for the date, earliest planned kitchen-ready time first. */
  orders: KitchenOrderDto[];
  production: ProductionLineDto[];
  /** Placed orders for the date that cut-off processing hasn't confirmed yet. */
  awaitingConfirmation: { orders: number; meals: number };
}
