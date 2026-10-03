import type { Metadata } from 'next';
import { RequirePermission } from '@/components/require-permission';
import { CutoffsView } from './cutoffs-view';

export const metadata: Metadata = { title: 'Cut-offs' };

export default function CutoffsPage() {
  return (
    <RequirePermission permission="CUTOFF_RUN">
      <CutoffsView />
    </RequirePermission>
  );
}
