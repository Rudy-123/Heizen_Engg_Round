import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RequirePermission } from '@/components/require-permission';
import { CompanyEditor } from './company-editor';

export const metadata: Metadata = { title: 'Company' };

export default async function CompanyPage({ params }: PageProps<'/companies/[id]'>) {
  const { id } = await params;
  return (
    <RequirePermission permission="COMPANIES_READ">
      <Suspense>
        <CompanyEditor id={id} />
      </Suspense>
    </RequirePermission>
  );
}
