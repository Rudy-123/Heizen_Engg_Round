'use client';

import { formatOrderNumber, type KitchenBoardDto } from '@fernleaf/shared';
import { ArrowRight, ChefHat, Flame, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { Progress, StatTile } from '@/components/stat-tile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { addDays } from '@/lib/dates';
import { formatInstant, formatIsoDate } from '@/lib/format';
import { useKitchenTimeZone, useKitchenToday } from '@/lib/kitchen-clock';
import { useKitchenBoard } from '@/lib/operations-queries';

/**
 * Kitchen lead at 6 am: "what do I cook, where, and by when?" Built from the kitchen board's
 * data (today and tomorrow), so every number matches the board. No money.
 */
export function KitchenDashboard() {
  const today = useKitchenToday();
  const board = useKitchenBoard(today);
  const tomorrow = useKitchenBoard(today ? addDays(today, 1) : undefined);
  const zone = useKitchenTimeZone() ?? 'Asia/Kolkata';
  const hhmm = (iso: string) =>
    formatInstant(iso, zone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  if (board.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }
  if (board.isError) return <p className="text-sm text-destructive">{board.error.message}</p>;

  const b = board.data;
  const units = b.orders.flatMap((o) => o.units);
  const meals = units.reduce((sum, u) => sum + u.quantity, 0);
  const mealsDone = units.filter((u) => u.doneAt).reduce((sum, u) => sum + u.quantity, 0);
  const late = b.orders.filter((o) => o.risk === 'LATE');
  const atRisk = b.orders.filter((o) => o.risk === 'AT_RISK');
  const next = b.orders.find((o) => o.risk !== 'READY');

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={<ChefHat />}
          label="Meals to cook today"
          value={`${mealsDone} / ${meals}`}
          note={`${b.orders.length} confirmed orders · ${units.length} prep units`}
        >
          <Progress value={mealsDone} total={meals} />
        </StatTile>
        <StatTile
          icon={<Flame />}
          label="Late"
          value={late.length}
          note="Orders past their planned kitchen-ready time"
          tone={late.length > 0 ? 'danger' : undefined}
        />
        <StatTile
          icon={<TriangleAlert />}
          label="At risk"
          value={atRisk.length}
          note={`Due within ${b.atRiskMinutes} minutes, not ready`}
          tone={atRisk.length > 0 ? 'warning' : undefined}
        />
        <StatTile
          label="Next deadline"
          value={next ? hhmm(next.plannedKitchenReadyAt) : '-'}
          note={
            next
              ? `${formatOrderNumber(next.number)} · ${next.companyName}`
              : 'Everything for today is ready'
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Stations</CardTitle>
            <Button size="sm" asChild>
              <Link href="/kitchen">
                Open the board <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {b.stations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No stations set up.</p>
            ) : null}
            {b.stations.map((station) => (
              <div key={station.id ?? 'unassigned'} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{station.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {station.meals} meals · {station.notStarted} not started · {station.inProgress}{' '}
                    cooking · {station.done}/{station.units} done
                  </span>
                </div>
                <Progress value={station.done} total={station.units} className="mt-1" />
              </div>
            ))}
          </CardContent>
        </Card>

        <AllergenWatch board={b} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What to batch today</CardTitle>
            <p className="text-sm text-muted-foreground">Biggest dishes first, split by choices.</p>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {b.production.length === 0 ? (
              <p className="text-muted-foreground">Nothing confirmed for today.</p>
            ) : null}
            {b.production.slice(0, 8).map((line) => (
              <div key={`${line.stationId}|${line.dishName}`} className="flex gap-3">
                <span className="w-10 shrink-0 text-right font-semibold tabular-nums">
                  {line.meals}
                </span>
                <div className="min-w-0">
                  <p className="font-medium">{line.dishName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {line.combinations
                      .map(
                        (c) =>
                          `${c.meals} × ${c.choices.length > 0 ? c.choices.join(', ') : 'as it comes'}`,
                      )
                      .join(' · ')}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tomorrow</CardTitle>
            <p className="text-sm text-muted-foreground">
              {today
                ? formatIsoDate(addDays(today, 1), {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })
                : ''}{' '}
              - for prep ahead.
            </p>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {tomorrow.data ? (
              <TomorrowPreview board={tomorrow.data} />
            ) : (
              <Skeleton className="h-20" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Meals containing each allergen, and the units where it is an employee's recorded allergy. */
function AllergenWatch({ board }: { board: KitchenBoardDto }) {
  const meals = new Map<string, number>();
  const conflicts: { order: number; employee: string; dish: string; allergens: string[] }[] = [];
  for (const order of board.orders) {
    for (const unit of order.units) {
      for (const allergen of unit.allergens) {
        meals.set(allergen, (meals.get(allergen) ?? 0) + unit.quantity);
      }
      if (unit.allergyConflicts.length > 0) {
        conflicts.push({
          order: order.number,
          employee: order.employeeName,
          dish: unit.dishName,
          allergens: unit.allergyConflicts,
        });
      }
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Allergen watch</CardTitle>
        <p className="text-sm text-muted-foreground">Meals today containing each allergen.</p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-1.5">
          {[...meals.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([allergen, count]) => (
              <Badge key={allergen} variant="outline">
                {allergen} <span className="tabular-nums">{count}</span>
              </Badge>
            ))}
          {meals.size === 0 ? <span className="text-muted-foreground">None today.</span> : null}
        </div>
        {conflicts.length > 0 ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <p className="mb-1.5 font-medium text-destructive">
              {conflicts.length} {conflicts.length === 1 ? 'unit contains' : 'units contain'} an
              employee’s recorded allergy
            </p>
            <ul className="space-y-1 text-xs">
              {conflicts.map((c, i) => (
                <li key={i}>
                  <span className="font-mono">{formatOrderNumber(c.order)}</span> · {c.employee} ·{' '}
                  {c.dish} - <strong>{c.allergens.join(', ')}</strong>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TomorrowPreview({ board }: { board: KitchenBoardDto }) {
  const meals = board.stations.reduce((sum, s) => sum + s.meals, 0);
  return (
    <>
      <p>
        <strong className="tabular-nums">{meals}</strong> confirmed meals
        {board.awaitingConfirmation.meals > 0
          ? ` · ${board.awaitingConfirmation.meals} more placed, confirmed at the cut-off`
          : ''}
      </p>
      {board.stations
        .filter((s) => s.meals > 0)
        .map((station) => (
          <div key={station.id ?? 'unassigned'} className="flex justify-between">
            <span>{station.name}</span>
            <span className="tabular-nums">{station.meals} meals</span>
          </div>
        ))}
    </>
  );
}
