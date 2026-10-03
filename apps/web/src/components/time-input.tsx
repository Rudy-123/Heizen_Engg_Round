'use client';

import { minutesToTime, timeToMinutes } from '@fernleaf/shared';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** An <input type="time"> bound to a "minutes since midnight" number (12:30 -> 750). */
export function TimeInput({
  id,
  value,
  onChange,
  invalid,
  className,
}: {
  id?: string;
  value: number | undefined;
  onChange: (minutes: number) => void;
  invalid?: boolean;
  className?: string;
}) {
  return (
    <Input
      id={id}
      type="time"
      className={cn('w-32', className)}
      value={typeof value === 'number' && Number.isFinite(value) ? minutesToTime(value) : ''}
      onChange={(event) => onChange(timeToMinutes(event.target.value) ?? Number.NaN)}
      aria-invalid={invalid || undefined}
    />
  );
}
