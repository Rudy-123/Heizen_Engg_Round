import type { Metadata } from 'next';
import { RequirePermission } from '@/components/require-permission';
import { DriverView } from './driver-view';

export const metadata: Metadata = { title: 'My deliveries' };

export default function DriverPage() {
  return (
    <RequirePermission permission="DELIVERIES_OWN">
      <DriverView />
    </RequirePermission>
  );
}
