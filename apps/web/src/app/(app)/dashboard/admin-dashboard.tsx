'use client';

import { formatCents, type AdminDashboardDto, type CutoffWatchDto } from '@fernleaf/shared';
import { useQuery } from '@tanstack/react-query';
import {
  AlarmClock,
  ArrowRight,
  ChefHat,
  CircleCheck,
  Flame,
  Receipt,
  Truck,
  TriangleAlert,
  UtensilsCrossed,
} from 'lucide-react';
import Link from 'next/link';
import { Progress, StatTile } from '@/components/stat-tile';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatInstant, formatIsoDate } from '@/lib/format';
import { useKitchenTimeZone } from '@/lib/kitchen-clock';

/**
 * Admin: "is today on track, and what needs a decision?" Every figure is defined in the
 * README (Dashboards). Refreshes every minute.
 */
export function AdminDashboard() {
  const dashboard = useQuery({
    queryKey: ['dashboard', 'admin'],
    queryFn: () => api.get<AdminDashboardDto>('/dashboard/admin'),
    refetchInterval: 60_000,
  });
  const zone = useKitchenTimeZone() ?? 'Asia/Kolkata';

  if (dashboard.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }
  if (dashboard.isError)
    return <p className="text-sm text-destructive">{dashboard.error.message}</p>;

  const d = dashboard.data;
  const t = d.today;
  const onTime = t.dropsDelivered > 0 ? Math.round((t.dropsOnTime / t.dropsDelivered) * 100) : null;
  const late = t.kitchenLate + t.dropsLate;
  const when = (iso: string) => formatInstant(iso, zone);
  const maxMeals = Math.max(
    1,
    ...d.week.map((day) => day.confirmedMeals + day.placedMeals + day.draftMeals),
  );

  return (
    <div className="space-y-6">
      {d.overdueCutoffs.length > 0 ? (
        <Alert variant="destructive">
          <AlarmClock />
          <AlertTitle>A cut-off has passed but wasn’t processed</AlertTitle>
          <AlertDescription>
            {d.overdueCutoffs
              .map(
                (c) =>
                  `${formatIsoDate(c.deliveryDate)}: ${c.placed} placed to confirm, ${c.drafts} drafts to cancel`,
              )
              .join(' · ')}
            . Automatic processing runs every 5 minutes;{' '}
            <Link href="/cutoffs" className="font-medium underline">
              run it now
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          Today · {formatIsoDate(d.date, { weekday: 'long', day: 'numeric', month: 'long' })}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={<UtensilsCrossed />}
            label="Meals today"
            value={t.meals}
            note={`${t.orders} confirmed orders${t.placedWaiting > 0 ? ` · ${t.placedWaiting} more placed late, confirmed at the next run` : ''}`}
          />
          <StatTile
            icon={<Truck />}
            label="Delivered so far"
            value={`${t.mealsDelivered} / ${t.meals}`}
            note={`${t.dropsDelivered} of ${t.dropsTotal} drops delivered`}
          >
            <Progress value={t.mealsDelivered} total={t.meals} />
          </StatTile>
          <StatTile
            icon={<CircleCheck />}
            label="On time"
            value={onTime === null ? '-' : `${onTime}%`}
            note={
              onTime === null
                ? 'No drops delivered yet today'
                : `${t.dropsOnTime} of ${t.dropsDelivered} delivered drops`
            }
            tone={onTime !== null && onTime < 90 ? 'warning' : undefined}
          />
          <StatTile
            icon={<Flame />}
            label="Late right now"
            value={late}
            note={`${t.kitchenLate} orders behind in the kitchen · ${t.dropsLate} drops behind on the road`}
            tone={late > 0 ? 'danger' : undefined}
          >
            {late > 0 ? (
              <div className="mt-1 flex gap-3 text-xs font-medium">
                <Link href="/kitchen" className="text-primary underline">
                  Kitchen board
                </Link>
                <Link href="/dispatch" className="text-primary underline">
                  Dispatch board
                </Link>
              </div>
            ) : null}
          </StatTile>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <NextCutoff cutoff={d.nextCutoff} when={when} />

        <Card>
          <CardHeader>
            <CardTitle>Next 7 days</CardTitle>
            <p className="text-sm text-muted-foreground">
              Meals per delivery date. Drafts are cancelled at the cut-off unless placed.
            </p>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {d.week.map((day) => {
              const total = day.confirmedMeals + day.placedMeals + day.draftMeals;
              return (
                <div key={day.date} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0">{formatIsoDate(day.date)}</span>
                  {day.kitchenOpen ? (
                    <>
                      <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="bg-primary"
                          style={{ width: `${(day.confirmedMeals / maxMeals) * 100}%` }}
                        />
                        <div
                          className="bg-primary/45"
                          style={{ width: `${(day.placedMeals / maxMeals) * 100}%` }}
                        />
                        <div
                          className="bg-warning"
                          style={{ width: `${(day.draftMeals / maxMeals) * 100}%` }}
                        />
                      </div>
                      <span className="w-40 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                        <strong className="text-foreground">{total}</strong> · {day.confirmedMeals}{' '}
                        conf · {day.placedMeals} placed · {day.draftMeals} draft
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">Kitchen closed</span>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {d.billing ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Receipt className="size-4" /> Billing
              </CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/billing">
                  Open <ArrowRight />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">To invoice</p>
                <p className="font-display text-2xl font-semibold tabular-nums">
                  {formatCents(d.billing.uninvoicedCents)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {d.billing.uninvoicedOrders} confirmed orders on no invoice
                  {d.billing.pendingCreditsCents
                    ? ` · ${formatCents(d.billing.pendingCreditsCents)} credits waiting`
                    : ''}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unpaid invoices</p>
                <p className="font-display text-2xl font-semibold tabular-nums">
                  {formatCents(d.billing.unpaidCents)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {d.billing.unpaidInvoices} invoices
                  {d.billing.oldestUnpaidIssuedAt
                    ? ` · oldest issued ${formatInstant(d.billing.oldestUnpaidIssuedAt, zone, { day: 'numeric', month: 'short' })}`
                    : ''}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {d.dataHealth ? <DataHealth health={d.dataHealth} /> : null}
      </div>
    </div>
  );
}

function NextCutoff({
  cutoff,
  when,
}: {
  cutoff: CutoffWatchDto | null;
  when: (iso: string) => string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <AlarmClock className="size-4" /> Next cut-off
        </CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/cutoffs">
            All cut-offs <ArrowRight />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {cutoff ? (
          <div className="space-y-4">
            <p className="text-sm">
              Orders for{' '}
              <strong>
                {formatIsoDate(cutoff.deliveryDate, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </strong>{' '}
              lock at <strong>{when(cutoff.cutoffAt)}</strong>.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-primary/8 p-3">
                <p className="font-display text-2xl font-semibold tabular-nums">{cutoff.placed}</p>
                <p className="text-xs text-muted-foreground">
                  placed orders ({cutoff.placedMeals} meals) will be confirmed
                </p>
              </div>
              <div
                className={
                  cutoff.drafts > 0 ? 'rounded-lg bg-warning/15 p-3' : 'rounded-lg bg-muted p-3'
                }
              >
                <p className="font-display text-2xl font-semibold tabular-nums">{cutoff.drafts}</p>
                <p className="text-xs text-muted-foreground">
                  drafts ({cutoff.draftMeals} meals) will be cancelled unless placed
                </p>
              </div>
            </div>
            {cutoff.drafts > 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-warning-foreground">
                <TriangleAlert className="size-3.5" /> Chase the drafts before the lock.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No cut-off in the next three weeks.</p>
        )}
      </CardContent>
    </Card>
  );
}

function DataHealth({ health }: { health: NonNullable<AdminDashboardDto['dataHealth']> }) {
  const problems =
    health.tiersMissingPrices.length +
    health.companiesWithoutOwner.length +
    health.companiesWithoutAddress.length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ChefHat className="size-4" /> Data that needs fixing
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          These quietly change what employees can order.
        </p>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {problems === 0 ? (
          <p className="flex items-center gap-2 text-success">
            <CircleCheck className="size-4" /> Nothing to fix.
          </p>
        ) : null}
        {health.tiersMissingPrices.map((tier) => (
          <Link
            key={tier.id}
            href={`/pricing/tiers/${tier.id}`}
            className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-accent/40"
          >
            <span>
              <strong>{tier.missingDishes}</strong>{' '}
              {tier.missingDishes === 1 ? 'dish has' : 'dishes have'} no price on{' '}
              <strong>{tier.name}</strong> - hidden for its {tier.companies}{' '}
              {tier.companies === 1 ? 'company' : 'companies'}
            </span>
            <ArrowRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
        {health.companiesWithoutOwner.map((company) => (
          <Link
            key={`owner-${company.id}`}
            href={`/companies/${company.id}`}
            className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-accent/40"
          >
            <span>
              <strong>{company.name}</strong> has no owner
            </span>
            <ArrowRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
        {health.companiesWithoutAddress.map((company) => (
          <Link
            key={`address-${company.id}`}
            href={`/companies/${company.id}`}
            className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-accent/40"
          >
            <span>
              <strong>{company.name}</strong> has no delivery address in use
            </span>
            <ArrowRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
