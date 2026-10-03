import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RequirePermission } from '@/components/require-permission';
import { MenuView } from './menu-view';

export const metadata: Metadata = { title: 'Menu' };

export default function MenuPage() {
  return (
    <RequirePermission permission="MENU_READ">
      <Suspense>
        <MenuView />
      </Suspense>
    </RequirePermission>
  );
}
