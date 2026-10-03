import type { Metadata } from 'next';
import { RequirePermission } from '@/components/require-permission';
import { EditOrder } from './edit-order';

export const metadata: Metadata = { title: 'Edit order' };

export default async function EditOrderPage({ params }: PageProps<'/orders/[id]/edit'>) {
  const { id } = await params;
  return (
    <RequirePermission permission="ORDERS_WRITE">
      <EditOrder id={id} />
    </RequirePermission>
  );
}
