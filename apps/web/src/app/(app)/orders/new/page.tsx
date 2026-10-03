import type { Metadata } from 'next';
import { RequirePermission } from '@/components/require-permission';
import { OrderForm } from '../order-form';

export const metadata: Metadata = { title: 'New order' };

export default function NewOrderPage() {
  return (
    <RequirePermission permission="ORDERS_WRITE">
      <OrderForm order={null} />
    </RequirePermission>
  );
}
