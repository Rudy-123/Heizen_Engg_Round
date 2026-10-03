import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';

export const metadata: Metadata = { title: 'Companies' };

export default function CompaniesPage() {
  return (
    <RequirePermission permission="COMPANIES_READ">
      <PageHeader title="Companies" description="Client companies and their employees." />
      <ComingSoon
        plannedFeatures={[
          'Email domains, delivery addresses, billing contact and owner',
          'Working days, holidays and delivery defaults',
          'Price tier and menu items hidden from the company',
          'Employees with their permissions, allergies and dietary preferences',
        ]}
      />
    </RequirePermission>
  );
}
