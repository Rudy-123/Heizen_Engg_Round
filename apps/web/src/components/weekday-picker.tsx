'use client';

import { WEEKDAYS } from '@fernleaf/shared';
import { cn } from '@/lib/utils';

/** Mon-Sun toggle buttons bound to a list of ISO weekdays (1 = Monday). */
export function WeekdayPicker({
  value,
  onChange,
  label,
  disabled,
}: {
  value: number[];
  onChange: (days: number[]) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {WEEKDAYS.map((day) => {
        const selected = value.includes(day.iso);
        return (
          <button
            key={day.iso}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() =>
              onChange(selected ? value.filter((d) => d !== day.iso) : [...value, day.iso])
            }
            className={cn(
              'h-9 w-14 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:bg-accent',
            )}
          >
            {day.short}
          </button>
        );
      })}
    </div>
  );
}
