import type { Prisma } from '../generated/prisma/client.js';

/**
 * Spec 4.8: orders for the same company, address and exact delivery time make up one drop
 * and travel together. An order joins its drop when it is confirmed; a new drop starts with
 * the company's default driver.
 */
export async function joinDrop(
  tx: Prisma.TransactionClient,
  order: {
    deliveryDate: Date;
    companyId: string;
    addressId: string;
    deliveryTimeMinutes: number;
    deliveryAt: Date;
  },
  defaultDriverId: string | null,
) {
  const key = {
    deliveryDate: order.deliveryDate,
    companyId: order.companyId,
    addressId: order.addressId,
    deliveryTimeMinutes: order.deliveryTimeMinutes,
  };
  return tx.drop.upsert({
    where: { deliveryDate_companyId_addressId_deliveryTimeMinutes: key },
    create: { ...key, deliveryAt: order.deliveryAt, driverId: defaultDriverId },
    update: {},
  });
}

/**
 * A drop that gains an order after it was packed goes back to packing: the new order still
 * has to come out of the kitchen first. (A drop that has already left takes no new orders.)
 */
export async function reopenIfPacked(
  tx: Prisma.TransactionClient,
  drop: { id: string; dispatchReadyAt: Date | null; outForDeliveryAt: Date | null },
) {
  if (drop.dispatchReadyAt && !drop.outForDeliveryAt) {
    await tx.drop.update({
      where: { id: drop.id },
      data: { dispatchReadyAt: null, version: { increment: 1 } },
    });
  }
}

/** A drop nobody travels in any more is removed - unless dispatch already started on it. */
export async function removeDropIfEmpty(tx: Prisma.TransactionClient, dropId: string) {
  const remaining = await tx.order.count({
    where: { dropId, status: { in: ['CONFIRMED', 'DELIVERED'] } },
  });
  if (remaining === 0) {
    await tx.order.updateMany({ where: { dropId }, data: { dropId: null } });
    await tx.drop.deleteMany({ where: { id: dropId, dispatchReadyAt: null } });
  }
}
