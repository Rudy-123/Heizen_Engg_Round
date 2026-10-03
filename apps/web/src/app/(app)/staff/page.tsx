import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';

export const metadata: Metadata = { title: 'Staff & roles' };

export default function StaffPage() {
  return (
    <RequirePermission permission="STAFF_MANAGE">
      <PageHeader title="Staff & roles" description="Who can sign in, and what each role can do." />
      <ComingSoon
        plannedFeatures={[
          'Create staff accounts and give each person exactly one role',
          'Deactivate accounts (they are signed out immediately)',
          'See which permissions each role has',
        ]}
      />
    </RequirePermission>
  );
}
