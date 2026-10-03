import { z } from 'zod';

/**
 * Dispatch and delivery (spec 4.8). Orders for the same company, address and exact delivery
 * time travel together as one drop. A drop moves kitchen ready -> dispatch ready -> out for
 * delivery -> delivered; each step needs the one before and happens once.
 */

export const DROP_STAGES = [
  'AWAITING_KITCHEN',
  'KITCHEN_READY',
  'DISPATCH_READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;
export type DropStage = (typeof DROP_STAGES)[number];

export const DROP_STAGE_LABELS: Record<DropStage, string> = {
  AWAITING_KITCHEN: 'In the kitchen',
  KITCHEN_READY: 'Kitchen ready',
  DISPATCH_READY: 'Dispatch ready',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
};

export const assignDriverSchema = z.object({
  /** null takes the driver off the drop. */
  driverId: z.string().min(1).nullable(),
});
export type AssignDriverInput = z.infer<typeof assignDriverSchema>;

/** Photos are shrunk in the browser before upload; this caps the encoded size (~1 MB). */
export const MAX_DELIVERY_PHOTO_BASE64_LENGTH = 1_400_000;

export const deliverDropSchema = z.object({
  note: z.string().trim().max(500, { message: 'Keep the note under 500 characters.' }).default(''),
  photo: z
    .object({
      mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      dataBase64: z
        .string()
        .min(1)
        .max(MAX_DELIVERY_PHOTO_BASE64_LENGTH, { message: 'The photo is too large.' })
        .regex(/^[A-Za-z0-9+/]+=*$/, { message: 'The photo could not be read.' }),
    })
    .nullable()
    .default(null),
});
export type DeliverDropInput = z.infer<typeof deliverDropSchema>;

export interface DropOrderDto {
  id: string;
  number: number;
  status: 'CONFIRMED' | 'DELIVERED';
  employeeName: string;
  meals: number;
  packagingName: string;
  notes: string;
  kitchenReadyAt: string | null;
}

export interface DropDto {
  id: string;
  deliveryDate: string;
  deliveryTimeMinutes: number;
  deliveryAt: string;
  company: { id: string; name: string };
  addressText: string;
  /** The company's standing instructions plus the address's own (gate codes, floor...). */
  instructions: string[];
  driver: { id: string; name: string; phone: string | null } | null;
  stage: DropStage;
  /** Earliest planned dispatch-ready time of its orders: when it should leave the kitchen. */
  plannedDispatchReadyAt: string;
  dispatchReadyAt: string | null;
  outForDeliveryAt: string | null;
  deliveredAt: string | null;
  deliveredOnTime: boolean | null;
  deliveryNote: string | null;
  hasPhoto: boolean;
  /** Should have left by now but hasn't. */
  lateLeaving: boolean;
  /** Past the delivery time (plus grace) and not delivered. */
  lateDelivering: boolean;
  meals: number;
  ordersReady: number;
  orders: DropOrderDto[];
}

export interface DriverLoadDto {
  id: string;
  name: string;
  drops: number;
  delivered: number;
}

export interface DispatchBoardDto {
  date: string;
  now: string;
  onTimeGraceMinutes: number;
  /** In delivery-time order. */
  drops: DropDto[];
  /** Everyone who can be given drops (people with the "own deliveries" permission). */
  drivers: DriverLoadDto[];
  /** Confirmed orders with no drop: their drop had already left when they were confirmed. */
  ordersWithoutDrop: {
    id: string;
    number: number;
    employeeName: string;
    companyName: string;
    deliveryTimeMinutes: number;
  }[];
}

/** The driver's own day: their drops for today only, in time order. */
export interface DriverDayDto {
  date: string;
  now: string;
  drops: DropDto[];
}
