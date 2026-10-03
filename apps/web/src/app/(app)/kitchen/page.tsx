import type { Metadata } from 'next';
import { RequirePermission } from '@/components/require-permission';
import { KitchenBoard } from './kitchen-board';

export const metadata: Metadata = { title: 'Kitchen board' };

export default function KitchenPage() {
  return (
    <RequirePermission permission="KITCHEN_READ">
      <KitchenBoard />
    </RequirePermission>
  );
}
