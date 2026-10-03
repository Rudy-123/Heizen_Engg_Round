import { Leaf } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The Fernleaf Kitchen logo and name. */
export function Brand({ className, subtitle }: { className?: string; subtitle?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Leaf className="size-5" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-semibold tracking-tight">Fernleaf Kitchen</span>
        {subtitle ? <span className="text-xs opacity-70">{subtitle}</span> : null}
      </span>
    </div>
  );
}
