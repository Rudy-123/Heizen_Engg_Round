import type { Metadata } from 'next';
import { RequirePermission } from '@/components/require-permission';
import { TierGrid } from './tier-grid';

export const metadata: Metadata = { title: 'Price tier' };

export default async function PriceTierPage({
  params,
  searchParams,
}: PageProps<'/pricing/tiers/[id]'>) {
  const { id } = await params;
  const { show } = await searchParams;
  return (
    <RequirePermission permission="PRICING_READ">
      <TierGrid id={id} initialFilter={show === 'missing' ? 'missing' : 'all'} />
    </RequirePermission>
  );
}
