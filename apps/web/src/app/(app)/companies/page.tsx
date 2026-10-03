import type { Metadata } from 'next';
import { RequirePermission } from '@/components/require-permission';
import { CompaniesView } from './companies-view';

export const metadata: Metadata = { title: 'Companies' };

export default function CompaniesPage() {
  return (
    <RequirePermission permission="COMPANIES_READ">
      <CompaniesView />
    </RequirePermission>
  );
}
