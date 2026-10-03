'use client';

import {
  formatCents,
  formatOrderNumber,
  minutesToTime,
  type OrderDetailDto,
} from '@fernleaf/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Ban,
  CalendarClock,
  ChefHat,
  CircleCheck,
  Clock,
  Lock,
  MapPin,
  Package,
  Pencil,
  Receipt,
  Send,
  Truck,
  Unlock,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { OrderStatusBadge } from '@/components/order-status-badge';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { formatInstant, formatIsoDate } from '@/lib/format';
import { useKitchenTimeZone } from '@/lib/kitchen-clock';
import { ordersQueryKey, orderQueryKey, useOrder } from '@/lib/order-queries';
import { DeliveryDialog, ReasonDialog } from './order-dialogs';

export function OrderDetail({ id }: { id: string }) {
  const order = useOrder(id);
  const zone = useKitchenTimeZone() ?? 'Asia/Kolkata';
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'cancel' | 'reject' | 'delivery' | null>(null);

  const saved = (result: OrderDetailDto) => {
    queryClient.setQueryData(orderQueryKey(id), result);
    void queryClient.invalidateQueries({ queryKey: ordersQueryKey });
  };
  const place = useMutation({
    mutationFn: (version: number) => api.post<OrderDetailDto>(`/orders/${id}/place`, { version }),
    onSuccess: (result) => {
      saved(result);
      toast.success('Order placed - prices are locked');
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not place the order.'),
  });

  const back = (
    <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
      <Link href="/orders">
        <ArrowLeft /> All orders
      </Link>
    </Button>
  );
  if (order.isPending) {
    return (
      <div className="space-y-4">
        {back}
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (order.isError) {
    return (
      <div>
        {back}
        <p className="text-sm text-destructive">{order.error.message}</p>
      </div>
    );
  }

  const data = order.data;
  const time = (iso: string | null) => (iso ? formatInstant(iso, zone) : '-');
  const clock = (iso: string) =>
    formatInstant(iso, zone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  return (
    <div className="mx-auto max-w-5xl">
      {back}
      <PageHeader
        title={formatOrderNumber(data.number)}
        description={`${data.employee.name} · ${data.company.name} · ${formatIsoDate(data.deliveryDate, { weekday: 'long', day: 'numeric', month: 'long' })} at ${minutesToTime(data.deliveryTimeMinutes)}`}
        actions={
          <>
            <OrderStatusBadge status={data.status} className="px-3 py-1 text-sm" />
            {data.allowed.edit ? (
              <Button variant="outline" asChild>
                <Link href={`/orders/${id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            ) : null}
            {data.allowed.place ? (
              <Button onClick={() => place.mutate(data.version)} disabled={place.isPending}>
                <Send /> Place order
              </Button>
            ) : null}
            {data.allowed.changeDelivery ? (
              <Button variant="outline" onClick={() => setDialog('delivery')}>
                <Truck /> Change delivery
              </Button>
            ) : null}
            {data.allowed.cancel ? (
              <Button variant="outline" onClick={() => setDialog('cancel')}>
                <Ban /> Cancel
              </Button>
            ) : null}
            {data.allowed.reject ? (
              <Button variant="ghost" onClick={() => setDialog('reject')}>
                Reject
              </Button>
            ) : null}
          </>
        }
      />

      {data.statusReason ? (
        <p className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {data.status === 'REJECTED' ? 'Rejected' : 'Cancelled'}: {data.statusReason}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>What was ordered</CardTitle>
            </CardHeader>
            <CardContent className="divide-y px-0">
              {data.lines.map((line) => (
                <div key={line.id} className="px-5 py-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-semibold">
                      {line.quantity} × {line.dishName}{' '}
                      <span className="font-mono text-xs font-normal text-muted-foreground">
                        {line.dishSku}
                      </span>
                    </p>
                    <p className="font-semibold tabular-nums">{formatCents(line.lineTotalCents)}</p>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {line.combinations.map((combination) => (
                      <li
                        key={combination.id}
                        className="flex items-start justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm"
                      >
                        <span>
                          <span className="font-medium tabular-nums">{combination.quantity} ×</span>{' '}
                          {combination.options.length === 0
                            ? 'As it comes'
                            : combination.options
                                .map(
                                  (o) =>
                                    `${o.optionName}${o.portionName ? ` (${o.portionName})` : ''}`,
                                )
                                .join(', ')}
                          {combination.kitchenDoneAt ? (
                            <Badge variant="success" className="ml-2">
                              <CircleCheck /> Cooked
                            </Badge>
                          ) : combination.kitchenStartedAt ? (
                            <Badge variant="outline" className="ml-2">
                              <ChefHat /> Cooking
                            </Badge>
                          ) : null}
                        </span>
                        <span className="text-right whitespace-nowrap text-muted-foreground tabular-nums">
                          {formatCents(combination.unitPriceCents)} each ={' '}
                          <span className="text-foreground">
                            {formatCents(combination.totalCents)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="flex items-center justify-between bg-accent/40 px-5 py-4">
                <span className="text-sm text-muted-foreground">
                  {data.mealCount} meals · priced on the {data.priceTier.name} tier · pre-tax, no
                  fees
                </span>
                <span className="font-display text-2xl font-semibold tabular-nums">
                  {formatCents(data.totalCents)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l pl-5">
                {data.events.map((event) => (
                  <li key={event.id} className="relative">
                    <span className="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full border-2 border-card bg-primary" />
                    <p className="text-sm">{event.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {time(event.createdAt)} · {event.actorName ?? 'System'}
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 text-sm">
              <Fact icon={CalendarClock} label="Delivery">
                {formatIsoDate(data.deliveryDate, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}{' '}
                at {minutesToTime(data.deliveryTimeMinutes)}
              </Fact>
              <Fact icon={MapPin} label="Address">
                {data.addressText}
              </Fact>
              <Fact icon={Package} label="Packaging">
                {data.packagingName}
              </Fact>
              <Fact icon={Truck} label="Leaves the kitchen">
                by {clock(data.plannedDispatchReadyAt)} ({data.deliveryLeadMinutes} min before)
              </Fact>
              <Fact icon={ChefHat} label="Kitchen ready">
                by {clock(data.plannedKitchenReadyAt)}
                {data.kitchenReadyAt ? ` · done ${clock(data.kitchenReadyAt)}` : ''}
              </Fact>
              {data.notes ? <Fact label="Notes">{data.notes}</Fact> : null}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 text-sm">
              <Fact icon={data.isLocked ? Lock : Unlock} label="Cut-off">
                {data.cutoffAt
                  ? `${data.isLocked ? 'Locked since' : 'Locks at'} ${time(data.cutoffAt)}`
                  : 'Kitchen closed that day'}
              </Fact>
              <Fact icon={Clock} label="Placed">
                {time(data.placedAt)}
              </Fact>
              <Fact icon={CircleCheck} label="Confirmed">
                {time(data.confirmedAt)}
              </Fact>
              <Fact icon={Receipt} label="Invoice">
                {data.invoice
                  ? `INV-${String(data.invoice.number).padStart(4, '0')}`
                  : 'Not invoiced'}
              </Fact>
            </CardContent>
          </Card>
        </div>
      </div>

      {dialog === 'cancel' || dialog === 'reject' ? (
        <ReasonDialog
          order={data}
          action={dialog}
          onClose={() => setDialog(null)}
          onSaved={saved}
        />
      ) : null}
      {dialog === 'delivery' ? (
        <DeliveryDialog order={data} onClose={() => setDialog(null)} onSaved={saved} />
      ) : null}
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon?: typeof MapPin;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      {Icon ? <Icon className="mt-0.5 size-4 shrink-0 text-primary" /> : <span className="w-4" />}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p>{children}</p>
      </div>
    </div>
  );
}
