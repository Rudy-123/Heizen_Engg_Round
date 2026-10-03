import type { Metadata } from 'next';
import { RequirePermission } from '@/components/require-permission';
import { OrderDetail } from './order-detail';

export const metadata: Metadata = { title: 'Order' };

export default async function OrderPage({ params }: PageProps<'/orders/[id]'>) {
  const { id } = await params;
  return (
    <RequirePermission permission="ORDERS_READ">
      <OrderDetail id={id} />
    </RequirePermission>
  );
}
