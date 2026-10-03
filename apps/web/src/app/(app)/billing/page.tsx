import type { Metadata } from 'next';
import { RequirePermission } from '@/components/require-permission';
import { BillingView } from './billing-view';

export const metadata: Metadata = { title: 'Billing' };

export default function BillingPage() {
  return (
    <RequirePermission permission="BILLING_READ">
      <BillingView />
    </RequirePermission>
  );
}
