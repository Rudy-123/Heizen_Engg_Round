'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { useOrder } from '@/lib/order-queries';
import { OrderForm } from '../../order-form';

export function EditOrder({ id }: { id: string }) {
  const order = useOrder(id);
  if (order.isPending) return <Skeleton className="h-96" />;
  if (order.isError) return <p className="text-sm text-destructive">{order.error.message}</p>;
  if (!order.data.allowed.edit) {
    return (
      <p className="text-sm text-muted-foreground">
        This order can’t be edited any more ({order.data.status.toLowerCase()}).
      </p>
    );
  }
  return <OrderForm key={order.data.version} order={order.data} />;
}
