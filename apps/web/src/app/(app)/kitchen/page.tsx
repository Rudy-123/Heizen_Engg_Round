import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';

export const metadata: Metadata = { title: 'Kitchen board' };

export default function KitchenPage() {
  return (
    <RequirePermission permission="KITCHEN_READ">
      <PageHeader title="Kitchen board" description="What has to be cooked, station by station." />
      <ComingSoon
        plannedFeatures={[
          'Prep units for a delivery date, filtered by station',
          'Mark units started and done',
          'Late and at-risk work highlighted, with planned kitchen-ready times',
        ]}
      />
    </RequirePermission>
  );
}
