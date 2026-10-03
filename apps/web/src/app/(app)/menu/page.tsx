import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';

export const metadata: Metadata = { title: 'Menu' };

export default function MenuPage() {
  return (
    <RequirePermission permission="MENU_READ">
      <PageHeader title="Menu" description="How dishes are shown to each company's employees." />
      <ComingSoon
        plannedFeatures={[
          'Categories and items, in order, switched on or off',
          'Hide categories or items from specific companies; secret categories',
          'Preview the menu exactly as a given employee sees it, with prices',
        ]}
      />
    </RequirePermission>
  );
}
