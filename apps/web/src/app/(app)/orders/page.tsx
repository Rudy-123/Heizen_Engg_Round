import type { Metadata } from 'next';
import { RequirePermission } from '@/components/require-permission';
import { OrdersView } from './orders-view';

export const metadata: Metadata = { title: 'Orders' };

export default function OrdersPage() {
  return (
    <RequirePermission permission="ORDERS_READ">
      <OrdersView />
    </RequirePermission>
  );
}
