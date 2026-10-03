/**
 * The admin dashboard (spec 4.11): "is today on track, and what needs a decision?".
 * Every figure is defined in the README. Dates are delivery dates in the kitchen's zone;
 * meals are the sum of order-line quantities.
 *
 * The kitchen, dispatch and driver dashboards are built from the board endpoints they already
 * use, so their figures always match the boards.
 */

interface NamedRef {
  id: string;
  name: string;
}

export interface DayDemandDto {
  date: string;
  kitchenOpen: boolean;
  /** Meals in confirmed + delivered orders. */
  confirmedMeals: number;
  /** Meals in placed orders (confirmed at the cut-off). */
  placedMeals: number;
  /** Meals in drafts (cancelled at the cut-off unless placed). */
  draftMeals: number;
}

export interface CutoffWatchDto {
  deliveryDate: string;
  cutoffAt: string;
  drafts: number;
  draftMeals: number;
  placed: number;
  placedMeals: number;
}

export interface AdminDashboardDto {
  date: string;
  now: string;
  today: {
    /** Confirmed + delivered orders for today. */
    orders: number;
    meals: number;
    mealsDelivered: number;
    dropsTotal: number;
    dropsDelivered: number;
    dropsOnTime: number;
    /** Confirmed orders not kitchen ready after their planned kitchen-ready time. */
    kitchenLate: number;
    /** Drops not yet out after their planned dispatch time, or out and past delivery + grace. */
    dropsLate: number;
    /** Placed for today after the cut-off (by an admin); confirmed at the next run. */
    placedWaiting: number;
  };
  /** The next cut-off still to come, and what it will do. */
  nextCutoff: CutoffWatchDto | null;
  /** Cut-offs that have passed but still have drafts or placed orders (processing is due). */
  overdueCutoffs: CutoffWatchDto[];
  /** Today and the next 6 days. */
  week: DayDemandDto[];
  /** Null when the person can't see billing. */
  billing: {
    uninvoicedCents: number;
    uninvoicedOrders: number;
    pendingCreditsCents: number;
    unpaidCents: number;
    unpaidInvoices: number;
    oldestUnpaidIssuedAt: string | null;
  } | null;
  /** Null when the person can't see pricing and companies. */
  dataHealth: {
    tiersMissingPrices: (NamedRef & { missingDishes: number; companies: number })[];
    companiesWithoutOwner: NamedRef[];
    companiesWithoutAddress: NamedRef[];
  } | null;
}
