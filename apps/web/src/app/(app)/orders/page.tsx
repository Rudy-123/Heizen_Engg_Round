import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';

export const metadata: Metadata = { title: 'Orders' };

export default function OrdersPage() {
  return (
    <RequirePermission permission="ORDERS_READ">
      <PageHeader title="Orders" description="Every order, with its lines, money and progress." />
      <ComingSoon
        plannedFeatures={[
          'Search and filter by delivery date range, status, company and invoiced',
          'Create orders for an employee from their own menu, with a live price breakdown',
          'Order detail with option choices, money breakdown, delivery details and timeline',
        ]}
      />
    </RequirePermission>
  );
}
