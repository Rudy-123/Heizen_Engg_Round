'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Pick any number of items from a short list (allergens, dietary tags, sizes...). */
export function ToggleChips({
  items,
  value,
  onChange,
  disabled,
  emptyText = 'Nothing to choose from yet.',
}: {
  items: { id: string; name: string; isActive?: boolean }[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  emptyText?: string;
}) {
  // Inactive items stay visible only while selected, so old data still shows correctly.
  const shown = items.filter((item) => item.isActive !== false || value.includes(item.id));
  if (shown.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;

  return (
    <div className="flex flex-wrap gap-2">
      {shown.map((item) => {
        const selected = value.includes(item.id);
        return (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() =>
              onChange(selected ? value.filter((id) => id !== item.id) : [...value, item.id])
            }
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60',
              selected
                ? 'border-primary bg-primary/10 font-medium text-primary'
                : 'bg-card text-muted-foreground hover:bg-accent',
            )}
          >
            {selected ? <Check className="size-3.5" /> : null}
            {item.name}
          </button>
        );
      })}
    </div>
  );
}
