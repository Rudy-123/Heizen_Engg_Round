import { DROP_STAGE_LABELS, type DropStage } from '@fernleaf/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STYLES: Record<DropStage, string> = {
  AWAITING_KITCHEN: 'border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground',
  KITCHEN_READY: 'border-transparent bg-accent text-accent-foreground',
  DISPATCH_READY: 'border-transparent bg-primary/15 text-primary',
  OUT_FOR_DELIVERY: 'border-transparent bg-primary text-primary-foreground',
  DELIVERED: 'border-transparent bg-success/15 text-success',
};

export function DropStageBadge({ stage, className }: { stage: DropStage; className?: string }) {
  return <Badge className={cn(STYLES[stage], className)}>{DROP_STAGE_LABELS[stage]}</Badge>;
}
