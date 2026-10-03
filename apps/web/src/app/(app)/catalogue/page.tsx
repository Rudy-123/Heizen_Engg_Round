import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RequirePermission } from '@/components/require-permission';
import { CatalogueView } from './catalogue-view';

export const metadata: Metadata = { title: 'Dishes & options' };

export default function CataloguePage() {
  return (
    <RequirePermission permission="CATALOGUE_READ">
      <Suspense>
        <CatalogueView />
      </Suspense>
    </RequirePermission>
  );
}
