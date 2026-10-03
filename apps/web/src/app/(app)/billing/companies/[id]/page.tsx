import type { Metadata } from 'next';
import { RequirePermission } from '@/components/require-permission';
import { CompanyBilling } from './company-billing';

export const metadata: Metadata = { title: 'Company billing' };

export default async function CompanyBillingPage({ params }: PageProps<'/billing/companies/[id]'>) {
  const { id } = await params;
  return (
    <RequirePermission permission="BILLING_READ">
      <CompanyBilling companyId={id} />
    </RequirePermission>
  );
}
