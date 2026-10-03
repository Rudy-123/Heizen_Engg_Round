import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';

export const metadata: Metadata = { title: 'My deliveries' };

export default function DriverPage() {
  return (
    <RequirePermission permission="DELIVERIES_OWN">
      <div className="mx-auto max-w-xl">
        <PageHeader title="My deliveries" description="Your drops for today, in time order." />
        <ComingSoon
          plannedFeatures={[
            'Next drop first: time, company, address, number of boxes, driver instructions',
            'Open the address in maps with one tap',
            'Mark delivered with an optional note and photo',
          ]}
        />
      </div>
    </RequirePermission>
  );
}
