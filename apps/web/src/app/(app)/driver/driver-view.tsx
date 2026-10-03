'use client';

import { minutesToTime, type DriverDayDto, type DropDto } from '@fernleaf/shared';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChefHat, Info, MapPin, Navigation, Package, Truck } from 'lucide-react';
import { useState } from 'react';
import { DeliverDialog } from '@/components/deliver-dialog';
import { DropStageBadge } from '@/components/drop-stage-badge';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatInstant, formatIsoDate } from '@/lib/format';
import { useKitchenTimeZone } from '@/lib/kitchen-clock';
import { driverDayKey, useDriverDay } from '@/lib/operations-queries';
import { cn } from '@/lib/utils';

const mapsLink = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/**
 * Spec 4.8: a driver sees only their own drops for today, in time order, and marks each one
 * delivered with an optional note and photo. Built for a phone: one column, big targets,
 * the next drop first.
 */
export function DriverView() {
  const day = useDriverDay();
  const queryClient = useQueryClient();
  const [delivering, setDelivering] = useState<DropDto | null>(null);

  if (day.isPending) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  if (day.isError) return <p className="text-sm text-destructive">{day.error.message}</p>;

  const { drops } = day.data;
  const done = drops.filter((d) => d.stage === 'DELIVERED');
  const open = drops.filter((d) => d.stage !== 'DELIVERED');
  const [next, ...later] = open;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="My deliveries"
        description={`${formatIsoDate(day.data.date, { weekday: 'long', day: 'numeric', month: 'long' })} · your drops, in time order`}
      />

      {drops.length === 0 ? (
        <Card className="items-center gap-2 p-10 text-center">
          <Truck className="size-8 text-muted-foreground" />
          <p className="font-medium">No drops for you today.</p>
          <p className="text-sm text-muted-foreground">
            Dispatch assigns drops; they appear here as soon as you’re given one.
          </p>
        </Card>
      ) : (
        <div className="space-y-5">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="font-medium">
                {done.length} of {drops.length} delivered
              </span>
              <span className="text-muted-foreground">
                {drops.reduce((sum, d) => sum + d.meals, 0)} meals today
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-success transition-all"
                style={{ width: `${(done.length / drops.length) * 100}%` }}
              />
            </div>
          </div>

          {next ? (
            <section>
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Next
              </h2>
              <DropCard drop={next} highlight onDeliver={() => setDelivering(next)} />
            </section>
          ) : (
            <Card className="flex-row items-center gap-3 border-success/40 bg-success/10 p-4">
              <CheckCircle2 className="size-6 shrink-0 text-success" />
              <p className="font-medium">All done for today - thank you!</p>
            </Card>
          )}

          {later.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Later today
              </h2>
              {later.map((drop) => (
                <DropCard key={drop.id} drop={drop} onDeliver={() => setDelivering(drop)} />
              ))}
            </section>
          ) : null}

          {done.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Delivered
              </h2>
              {done.map((drop) => (
                <DropCard key={drop.id} drop={drop} onDeliver={() => undefined} />
              ))}
            </section>
          ) : null}
        </div>
      )}

      {delivering ? (
        <DeliverDialog
          drop={delivering}
          path={`/driver/drops/${delivering.id}/deliver`}
          onClose={() => setDelivering(null)}
          onDelivered={() => void queryClient.invalidateQueries({ queryKey: driverDayKey })}
        />
      ) : null}
    </div>
  );
}

function DropCard({
  drop,
  highlight,
  onDeliver,
}: {
  drop: DropDto;
  highlight?: boolean;
  onDeliver: () => void;
}) {
  const zone = useKitchenTimeZone() ?? 'Asia/Kolkata';
  const hhmm = (iso: string) =>
    formatInstant(iso, zone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const delivered = drop.stage === 'DELIVERED';

  if (delivered) {
    return (
      <Card className="flex-row items-center gap-3 p-3 text-sm">
        <CheckCircle2 className="size-5 shrink-0 text-success" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {minutesToTime(drop.deliveryTimeMinutes)} · {drop.company.name}
          </p>
          <p className="text-xs text-muted-foreground">
            Delivered {drop.deliveredAt ? hhmm(drop.deliveredAt) : ''} ·{' '}
            {drop.deliveredOnTime ? 'on time' : 'late'}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn('gap-4 p-4', highlight && 'border-primary/50 shadow-lift')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className={cn(
              'font-display leading-none font-semibold tabular-nums',
              highlight ? 'text-4xl' : 'text-2xl',
            )}
          >
            {minutesToTime(drop.deliveryTimeMinutes)}
          </p>
          <p className="mt-1.5 text-lg leading-tight font-semibold">{drop.company.name}</p>
        </div>
        <DropStageBadge stage={drop.stage} />
      </div>

      <a
        href={mapsLink(drop.addressText)}
        target="_blank"
        rel="noreferrer"
        className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-sm hover:bg-muted"
      >
        <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
        <span className="flex-1">{drop.addressText}</span>
        <Navigation className="mt-0.5 size-4 shrink-0 text-primary" aria-label="Open in maps" />
      </a>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="flex items-center gap-1.5">
          <Package className="size-4 text-muted-foreground" />
          <strong className="tabular-nums">{drop.meals}</strong> meals
        </span>
        <span className="text-muted-foreground">
          {drop.orders.length} {drop.orders.length === 1 ? 'order' : 'orders'}:{' '}
          {drop.orders
            .slice(0, 3)
            .map((o) => o.employeeName)
            .join(', ')}
          {drop.orders.length > 3 ? ` and ${drop.orders.length - 3} more` : ''}
        </span>
      </div>

      {drop.instructions.length > 0 ? (
        <p className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
          {drop.instructions.join(' · ')}
        </p>
      ) : null}

      {drop.stage === 'OUT_FOR_DELIVERY' ? (
        <Button size="lg" className="h-12 text-base" onClick={onDeliver}>
          <CheckCircle2 /> Mark delivered
        </Button>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ChefHat className="size-4" />
          {drop.stage === 'DISPATCH_READY'
            ? 'Packed and ready to collect at the kitchen.'
            : drop.stage === 'KITCHEN_READY'
              ? 'Cooked - being packed.'
              : `Still in the kitchen (${drop.ordersReady} of ${drop.orders.length} orders ready).`}{' '}
          Leaves at {hhmm(drop.plannedDispatchReadyAt)}.
        </p>
      )}
    </Card>
  );
}
