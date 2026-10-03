import type { Metadata } from 'next';
import { RequirePermission } from '@/components/require-permission';
import { DispatchBoard } from './dispatch-board';

export const metadata: Metadata = { title: 'Dispatch board' };

export default function DispatchPage() {
  return (
    <RequirePermission permission="DISPATCH_READ">
      <DispatchBoard />
    </RequirePermission>
  );
}
