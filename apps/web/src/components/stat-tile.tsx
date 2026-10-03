import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** One dashboard figure: a label, a big value and a line saying exactly what it counts. */
export function StatTile({
  label,
  value,
  note,
  icon,
  tone,
  children,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  icon?: ReactNode;
  tone?: 'danger' | 'warning' | 'success';
  children?: ReactNode;
}) {
  return (
    <Card
      className={cn(
        'gap-1 p-4',
        tone === 'danger' && 'border-destructive/40 bg-destructive/5',
        tone === 'warning' && 'border-warning/60 bg-warning/10',
        tone === 'success' && 'border-success/40 bg-success/5',
      )}
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground [&>svg]:size-4">
        {icon}
        {label}
      </div>
      <p
        className={cn(
          'font-display text-3xl font-semibold tabular-nums',
          tone === 'danger' && 'text-destructive',
          tone === 'warning' && 'text-warning-foreground',
          tone === 'success' && 'text-success',
        )}
      >
        {value}
      </p>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      {children}
    </Card>
  );
}

/** A thin progress bar, e.g. meals delivered out of meals today. */
export function Progress({
  value,
  total,
  className,
}: {
  value: number;
  total: number;
  className?: string;
}) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className={cn('mt-2 h-1.5 overflow-hidden rounded-full bg-muted', className)}>
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
