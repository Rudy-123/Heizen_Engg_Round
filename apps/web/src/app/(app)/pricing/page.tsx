import type { Metadata } from 'next';
import { RequirePermission } from '@/components/require-permission';
import { PricingView } from './pricing-view';

export const metadata: Metadata = { title: 'Pricing' };

export default function PricingPage() {
  return (
    <RequirePermission permission="PRICING_READ">
      <PricingView />
    </RequirePermission>
  );
}
