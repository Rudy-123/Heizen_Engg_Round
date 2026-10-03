import { TiffinMark } from '@/components/tiffin-mark';
import { cn } from '@/lib/utils';

/** The Fernleaf Kitchen logo and name. */
export function Brand({ className, subtitle }: { className?: string; subtitle?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="flex size-10 items-center justify-center rounded-xl bg-brand shadow-md ring-1 shadow-primary/25 ring-white/15 ring-inset">
        <TiffinMark className="size-7" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-display text-lg font-semibold tracking-tight">Fernleaf Kitchen</span>
        {subtitle ? <span className="text-xs text-muted-foreground">{subtitle}</span> : null}
      </span>
    </div>
  );
}
