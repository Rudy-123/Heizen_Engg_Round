'use client';

import { bpsToMultiplierString, multiplierStringToBps } from '@fernleaf/shared';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * A multiplier box bound to basis points. People type "2.4"; the form gets 24000. Anything
 * that isn't a valid multiplier becomes NaN, which the schema reports as an error.
 */
export function MultiplierInput({
  value,
  onChange,
  className,
  invalid,
  ...props
}: {
  value: number | null | undefined;
  onChange: (bps: number) => void;
  className?: string;
  invalid?: boolean;
  id?: string;
  'aria-label'?: string;
}) {
  const valid = typeof value === 'number' && Number.isFinite(value);
  const [text, setText] = useState(valid ? bpsToMultiplierString(value) : '');

  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
        ×
      </span>
      <Input
        inputMode="decimal"
        placeholder="2.4"
        className="pl-7 tabular-nums"
        value={text}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          setText(event.target.value);
          onChange(multiplierStringToBps(event.target.value) ?? Number.NaN);
        }}
        {...props}
      />
    </div>
  );
}
