import type { Metadata } from 'next';
import { RequirePermission } from '@/components/require-permission';
import { InvoiceDetail } from './invoice-detail';

export const metadata: Metadata = { title: 'Invoice' };

export default async function InvoicePage({ params }: PageProps<'/billing/invoices/[id]'>) {
  const { id } = await params;
  return (
    <RequirePermission permission="BILLING_READ">
      <InvoiceDetail id={id} />
    </RequirePermission>
  );
}
