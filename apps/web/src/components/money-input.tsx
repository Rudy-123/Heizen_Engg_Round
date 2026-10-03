'use client';

import { centsToDollarString, dollarStringToCents } from '@fernleaf/shared';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * A dollar amount box bound to an integer number of cents. People type "4.25"; the form gets
 * 425. Anything that isn't a valid amount becomes NaN, which the schema reports as an error.
 */
export function MoneyInput({
  value,
  onChange,
  className,
  invalid,
  ...props
}: {
  value: number | null | undefined;
  onChange: (cents: number) => void;
  className?: string;
  invalid?: boolean;
  id?: string;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  const valid = typeof value === 'number' && Number.isFinite(value);
  const [text, setText] = useState(valid ? centsToDollarString(value) : '');

  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
        $
      </span>
      <Input
        inputMode="decimal"
        className="pl-6 tabular-nums"
        value={text}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          setText(event.target.value);
          onChange(dollarStringToCents(event.target.value) ?? Number.NaN);
        }}
        onBlur={() => {
          const cents = dollarStringToCents(text);
          if (cents !== null) setText(centsToDollarString(cents));
        }}
        {...props}
      />
    </div>
  );
}
