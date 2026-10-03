import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';

export const metadata: Metadata = { title: 'Dishes & options' };

export default function CataloguePage() {
  return (
    <RequirePermission permission="CATALOGUE_READ">
      <PageHeader title="Dishes & options" description="Everything the kitchen can make." />
      <ComingSoon
        plannedFeatures={[
          'Dishes with SKU, temperature, cost, allergens, dietary tags, station and minimum quantity',
          'Reusable options and the option groups each dish offers',
          'Allergens, dietary tags, stations, portion sizes and packaging types',
        ]}
      />
    </RequirePermission>
  );
}
