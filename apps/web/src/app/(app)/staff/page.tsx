import type { Metadata } from 'next';
import { RequirePermission } from '@/components/require-permission';
import { StaffView } from './staff-view';

export const metadata: Metadata = { title: 'Staff & roles' };

export default function StaffPage() {
  return (
    <RequirePermission permission="STAFF_MANAGE">
      <StaffView />
    </RequirePermission>
  );
}
