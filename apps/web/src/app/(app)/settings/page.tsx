import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
  return (
    <RequirePermission permission="SETTINGS_READ">
      <PageHeader
        title="Settings"
        description="Platform-wide values, changed here - never in code."
      />
      <ComingSoon
        plannedFeatures={[
          'Kitchen working days and holidays',
          'Cut-off time and number of working days before delivery',
          'Other platform values: at-risk window, on-time grace, public email domains',
        ]}
      />
    </RequirePermission>
  );
}
