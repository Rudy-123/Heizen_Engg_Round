import type { Metadata } from 'next';
import { RequirePermission } from '@/components/require-permission';
import { DishEditor } from './dish-editor';

export const metadata: Metadata = { title: 'Dish' };

export default async function DishPage({ params }: PageProps<'/catalogue/dishes/[id]'>) {
  const { id } = await params;
  return (
    <RequirePermission permission="CATALOGUE_READ">
      <DishEditor id={id} />
    </RequirePermission>
  );
}
