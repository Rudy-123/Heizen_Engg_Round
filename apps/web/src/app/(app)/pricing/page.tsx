import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';

export const metadata: Metadata = { title: 'Pricing' };

export default function PricingPage() {
  return (
    <RequirePermission permission="PRICING_READ">
      <PageHeader title="Pricing" description="Price tiers and what each dish costs on them." />
      <ComingSoon
        plannedFeatures={[
          'Named price tiers, one of them the default',
          'Tiers derived from cost or another tier, rounded up to the next 5 cents',
          'A grid to edit a whole tier and spot dishes with no price',
        ]}
      />
    </RequirePermission>
  );
}
