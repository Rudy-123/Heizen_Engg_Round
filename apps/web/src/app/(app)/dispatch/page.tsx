import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';

export const metadata: Metadata = { title: 'Dispatch board' };

export default function DispatchPage() {
  return (
    <RequirePermission permission="DISPATCH_READ">
      <PageHeader
        title="Dispatch board"
        description="Drops leaving the kitchen and their drivers."
      />
      <ComingSoon
        plannedFeatures={[
          'Drops (same company, address and delivery time) with their status at a glance',
          'Assign a driver per drop, defaulting to the company’s driver',
          'Dispatch ready, out for delivery and delivered, with on-time tracking',
        ]}
      />
    </RequirePermission>
  );
}
