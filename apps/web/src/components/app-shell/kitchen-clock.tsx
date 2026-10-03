'use client';

import { Clock } from 'lucide-react';
import { useKitchenClockLabel } from '@/lib/kitchen-clock';

/** Kitchen date and time, always in the kitchen's zone. Every time in the app uses this zone. */
export function KitchenClock() {
  const label = useKitchenClockLabel();
  if (!label) return null;
  return (
    <div
      className="flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground"
      title="All times in this app are in the kitchen's time zone"
    >
      <Clock className="size-3.5" />
      <span className="hidden sm:inline">Kitchen time</span>
      <span className="font-medium text-foreground tabular-nums">{label}</span>
    </div>
  );
}
