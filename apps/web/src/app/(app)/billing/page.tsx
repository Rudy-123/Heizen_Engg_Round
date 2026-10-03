import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';

export const metadata: Metadata = { title: 'Billing' };

export default function BillingPage() {
  return (
    <RequirePermission permission="BILLING_READ">
      <PageHeader title="Billing" description="What each company owes, and their invoices." />
      <ComingSoon
        plannedFeatures={[
          'Confirmed orders not yet invoiced, per company',
          'Group orders into an invoice and mark invoices paid',
          'Credits for orders that change after they were invoiced',
        ]}
      />
    </RequirePermission>
  );
}
