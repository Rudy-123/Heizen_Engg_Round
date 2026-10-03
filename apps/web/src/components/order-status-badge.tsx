import { ORDER_STATUS_LABELS, type OrderStatus } from '@fernleaf/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STYLES: Record<OrderStatus, string> = {
  DRAFT: 'border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground',
  PLACED: 'border-transparent bg-accent text-accent-foreground',
  CONFIRMED: 'border-transparent bg-primary text-primary-foreground',
  DELIVERED: 'border-transparent bg-success/15 text-success',
  CANCELLED: 'border-transparent bg-secondary text-muted-foreground line-through decoration-1',
  REJECTED: 'border-transparent bg-destructive/12 text-destructive',
};

export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  return <Badge className={cn(STYLES[status], className)}>{ORDER_STATUS_LABELS[status]}</Badge>;
}
