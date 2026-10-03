import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';

export const metadata: Metadata = { title: 'Cut-offs' };

export default function CutoffsPage() {
  return (
    <RequirePermission permission="CUTOFF_RUN">
      <PageHeader
        title="Cut-offs"
        description="When each delivery date locks, and what cut-off processing did."
      />
      <ComingSoon
        plannedFeatures={[
          'Lock time for each upcoming delivery date',
          'Run cut-off processing now for a past cut-off (safe to run twice)',
          'History of every run: drafts cancelled, orders confirmed',
        ]}
      />
    </RequirePermission>
  );
}
