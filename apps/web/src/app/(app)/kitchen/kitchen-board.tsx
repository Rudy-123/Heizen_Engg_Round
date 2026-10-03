'use client';

import {
  formatOrderNumber,
  minutesToTime,
  type KitchenBoardDto,
  type KitchenOrderDto,
  type KitchenUnitDto,
} from '@fernleaf/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Flame,
  Loader2,
  Search,
  TriangleAlert,
  Zap,
} from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api, ApiError } from '@/lib/api';
import { addDays } from '@/lib/dates';
import { formatInstant, formatIsoDate } from '@/lib/format';
import { useKitchenTimeZone, useKitchenToday } from '@/lib/kitchen-clock';
import { kitchenBoardKey, useKitchenBoard } from '@/lib/operations-queries';
import { useCan } from '@/lib/session';
import { cn } from '@/lib/utils';

type StationFilter = { kind: 'all' } | { kind: 'station'; id: string | null };

/**
 * Spec 4.7: what has to be cooked for a delivery date, as prep units (one per combination),
 * by station. Orders are sorted by their planned kitchen-ready time; late and at-risk work is
 * coloured. The board refreshes itself every 20 seconds.
 */
export function KitchenBoard() {
  const today = useKitchenToday();
  const [chosenDate, setChosenDate] = useState<string | null>(null);
  const date = chosenDate ?? today;
  const board = useKitchenBoard(date);
  const [station, setStation] = useState<StationFilter>({ kind: 'all' });
  const [hideReady, setHideReady] = useState(true);
  const [view, setView] = useState<'orders' | 'production'>('orders');
  const [search, setSearch] = useState('');
  const query = useDeferredValue(search.trim().toLowerCase());

  return (
    <div>
      <PageHeader
        title="Kitchen board"
        description="Every confirmed order for the day, unit by unit. Times are kitchen time; the board refreshes itself."
        actions={
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous day"
              disabled={!date}
              onClick={() => date && setChosenDate(addDays(date, -1))}
            >
              <ChevronLeft />
            </Button>
            <Input
              type="date"
              className="w-40"
              aria-label="Delivery date"
              value={date ?? ''}
              onChange={(event) => setChosenDate(event.target.value || null)}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="Next day"
              disabled={!date}
              onClick={() => date && setChosenDate(addDays(date, 1))}
            >
              <ChevronRight />
            </Button>
            <Button variant="ghost" disabled={date === today} onClick={() => setChosenDate(null)}>
              Today
            </Button>
          </div>
        }
      />

      {board.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : board.isError ? (
        <p className="text-sm text-destructive">{board.error.message}</p>
      ) : (
        <BoardBody
          board={board.data}
          station={station}
          setStation={setStation}
          hideReady={hideReady}
          setHideReady={setHideReady}
          view={view}
          setView={setView}
          search={search}
          setSearch={setSearch}
          query={query}
        />
      )}
    </div>
  );
}

function BoardBody({
  board,
  station,
  setStation,
  hideReady,
  setHideReady,
  view,
  setView,
  search,
  setSearch,
  query,
}: {
  board: KitchenBoardDto;
  station: StationFilter;
  setStation: (station: StationFilter) => void;
  hideReady: boolean;
  setHideReady: (hide: boolean) => void;
  view: 'orders' | 'production';
  setView: (view: 'orders' | 'production') => void;
  search: string;
  setSearch: (search: string) => void;
  query: string;
}) {
  const inStation = (unit: KitchenUnitDto) =>
    station.kind === 'all' || unit.stationId === station.id;
  const stationNames = new Map(board.stations.map((s) => [s.id, s.name]));
  const counts = {
    meals: board.orders.reduce((sum, o) => sum + o.units.reduce((s, u) => s + u.quantity, 0), 0),
    ready: board.orders.filter((o) => o.risk === 'READY').length,
    late: board.orders.filter((o) => o.risk === 'LATE').length,
    atRisk: board.orders.filter((o) => o.risk === 'AT_RISK').length,
  };
  const firstDeadline = board.orders.find((o) => o.risk !== 'READY');
  const zone = useKitchenTimeZone() ?? 'Asia/Kolkata';
  const hhmm = (iso: string) =>
    formatInstant(iso, zone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  const visible = useMemo(
    () =>
      board.orders
        .map((order) => ({ order, units: order.units.filter(inStation) }))
        .filter(({ order, units }) => units.length > 0 && !(hideReady && order.risk === 'READY'))
        .filter(
          ({ order, units }) =>
            !query ||
            formatOrderNumber(order.number).toLowerCase().includes(query) ||
            order.employeeName.toLowerCase().includes(query) ||
            order.companyName.toLowerCase().includes(query) ||
            units.some((u) => u.dishName.toLowerCase().includes(query)),
        ),
    // inStation only depends on `station`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board.orders, station, hideReady, query],
  );
  const hiddenReady = hideReady
    ? board.orders.filter((o) => o.risk === 'READY' && o.units.some(inStation)).length
    : 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<ChefHat />}
          label="Meals to cook"
          value={counts.meals}
          note={`${board.orders.length} orders · ${counts.ready} ready`}
        />
        <Stat
          icon={<Flame />}
          label="Late"
          value={counts.late}
          note="Past their planned kitchen-ready time"
          tone={counts.late > 0 ? 'danger' : undefined}
        />
        <Stat
          icon={<TriangleAlert />}
          label="At risk"
          value={counts.atRisk}
          note={`Due within ${board.atRiskMinutes} minutes`}
          tone={counts.atRisk > 0 ? 'warning' : undefined}
        />
        <Stat
          icon={<CircleDashed />}
          label="Next deadline"
          value={firstDeadline ? hhmm(firstDeadline.plannedKitchenReadyAt) : '-'}
          note={
            board.awaitingConfirmation.orders > 0
              ? `${board.awaitingConfirmation.meals} more meals placed, waiting for the cut-off run`
              : firstDeadline
                ? `${formatOrderNumber(firstDeadline.number)} · ${firstDeadline.employeeName}`
                : 'Everything is ready'
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <StationChip
          active={station.kind === 'all'}
          onClick={() => setStation({ kind: 'all' })}
          label="All stations"
          open={board.stations.reduce((sum, s) => sum + s.units - s.done, 0)}
        />
        {board.stations.map((s) => (
          <StationChip
            key={s.id ?? 'unassigned'}
            active={station.kind === 'station' && station.id === s.id}
            onClick={() => setStation({ kind: 'station', id: s.id })}
            label={s.name}
            open={s.units - s.done}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-[1_1_16rem]">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Order number, employee, company or dish"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={hideReady} onCheckedChange={setHideReady} />
          Hide ready orders
        </label>
        <div className="flex rounded-lg border p-0.5">
          {(['orders', 'production'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                view === option
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option === 'orders' ? 'Orders' : 'What to batch'}
            </button>
          ))}
        </div>
      </div>

      {view === 'production' ? (
        <Production board={board} station={station} stationNames={stationNames} />
      ) : visible.length === 0 ? (
        <Card className="items-center p-10 text-center text-sm text-muted-foreground">
          {board.orders.length === 0
            ? `No confirmed orders for ${formatIsoDate(board.date)}.`
            : hiddenReady > 0
              ? `Everything here is ready (${hiddenReady} ready orders hidden).`
              : 'Nothing matches.'}
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map(({ order, units }) => (
              <OrderCard
                key={order.id}
                board={board}
                order={order}
                units={units}
                showStation={station.kind === 'all'}
                stationNames={stationNames}
              />
            ))}
          </div>
          {hiddenReady > 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              {hiddenReady} ready {hiddenReady === 1 ? 'order' : 'orders'} hidden.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  note: string;
  tone?: 'danger' | 'warning';
}) {
  return (
    <Card
      className={cn(
        'gap-1 p-4',
        tone === 'danger' && 'border-destructive/40 bg-destructive/5',
        tone === 'warning' && 'border-warning/60 bg-warning/10',
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
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </Card>
  );
}

function StationChip({
  active,
  onClick,
  label,
  open,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  open: number;
}) {
  return (
    <Button
      size="sm"
      variant={active ? 'default' : 'outline'}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
      <span
        className={cn(
          'rounded-full px-1.5 text-xs tabular-nums',
          active ? 'bg-primary-foreground/20' : 'bg-muted',
        )}
      >
        {open}
      </span>
    </Button>
  );
}

const RISK_STYLES: Record<KitchenOrderDto['risk'], string> = {
  LATE: 'border-l-destructive',
  AT_RISK: 'border-l-warning',
  READY: 'border-l-success',
  ON_TRACK: 'border-l-primary/30',
};

function OrderCard({
  board,
  order,
  units,
  showStation,
  stationNames,
}: {
  board: KitchenBoardDto;
  order: KitchenOrderDto;
  units: KitchenUnitDto[];
  showStation: boolean;
  stationNames: Map<string | null, string>;
}) {
  const zone = useKitchenTimeZone() ?? 'Asia/Kolkata';
  const canWork = useCan('KITCHEN_WORK');
  const canForce = useCan('KITCHEN_FORCE_COMPLETE');
  const queryClient = useQueryClient();
  const hhmm = (iso: string) =>
    formatInstant(iso, zone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const minutesFromNow = Math.round(
    (new Date(order.plannedKitchenReadyAt).getTime() - new Date(board.now).getTime()) / 60_000,
  );

  const act = useMutation({
    mutationFn: (action: { kind: 'start' | 'done'; unitId: string } | { kind: 'force' }) =>
      action.kind === 'force'
        ? api.post<KitchenOrderDto>(`/kitchen/orders/${order.id}/force-complete`)
        : api.post<KitchenOrderDto>(`/kitchen/units/${action.unitId}/${action.kind}`),
    onSuccess: (updated) => {
      // Show the change at once; the next refresh brings everyone else's work too.
      queryClient.setQueryData<KitchenBoardDto>(kitchenBoardKey(board.date), (old) =>
        old ? { ...old, orders: old.orders.map((o) => (o.id === updated.id ? updated : o)) } : old,
      );
      void queryClient.invalidateQueries({ queryKey: kitchenBoardKey(board.date) });
      if (updated.kitchenReadyAt && !order.kitchenReadyAt) {
        toast.success(`${formatOrderNumber(order.number)} is kitchen ready`);
      }
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not save that.');
      void queryClient.invalidateQueries({ queryKey: kitchenBoardKey(board.date) });
    },
  });
  const busy = (unitId: string) =>
    act.isPending && act.variables.kind !== 'force' && act.variables.unitId === unitId;

  return (
    <Card
      className={cn(
        'gap-3 border-l-4 p-4 [contain-intrinsic-size:auto_240px] [content-visibility:auto]',
        RISK_STYLES[order.risk],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Ready by
          </p>
          <p className="font-display text-2xl leading-none font-semibold tabular-nums">
            {hhmm(order.plannedKitchenReadyAt)}
          </p>
        </div>
        <RiskBadge order={order} minutesFromNow={minutesFromNow} hhmm={hhmm} />
      </div>
      <div className="text-sm">
        <p>
          <span className="font-mono font-semibold">{formatOrderNumber(order.number)}</span>
          <span className="text-muted-foreground"> · {order.employeeName}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {order.companyName} · delivery {minutesToTime(order.deliveryTimeMinutes)} ·{' '}
          {order.packagingName}
        </p>
        {order.notes ? (
          <p className="mt-1 rounded-md bg-accent/50 px-2 py-1 text-xs">Note: {order.notes}</p>
        ) : null}
      </div>

      <ul className="space-y-2">
        {units.map((unit) => (
          <li key={unit.id} className="rounded-lg bg-muted/50 p-2.5">
            <div className="flex items-start gap-2">
              <span className="font-display text-lg leading-tight font-semibold tabular-nums">
                {unit.quantity}×
              </span>
              <div className="min-w-0 flex-1">
                <p className="leading-tight font-medium">{unit.dishName}</p>
                {unit.choices.length > 0 ? (
                  <p className="text-xs text-muted-foreground">{unit.choices.join(' · ')}</p>
                ) : null}
                <div className="mt-1 flex flex-wrap gap-1">
                  {showStation ? (
                    <Badge variant="outline" className="text-[11px]">
                      {stationNames.get(unit.stationId) ?? 'Unassigned'}
                    </Badge>
                  ) : null}
                  {unit.allergyConflicts.length > 0 ? (
                    <Badge variant="destructive" className="text-[11px]">
                      <TriangleAlert /> Allergy: {unit.allergyConflicts.join(', ')}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">
                {unit.doneAt ? (
                  <span className="flex items-center gap-1 font-medium text-success">
                    <CheckCircle2 className="size-3.5" /> Done {hhmm(unit.doneAt)}
                    {unit.doneByName ? ` · ${unit.doneByName}` : ''}
                  </span>
                ) : unit.startedAt ? (
                  <span className="flex items-center gap-1 font-medium text-primary">
                    <Loader2 className="size-3.5" /> Started {hhmm(unit.startedAt)}
                    {unit.startedByName ? ` · ${unit.startedByName}` : ''}
                  </span>
                ) : (
                  'Not started'
                )}
              </span>
              {canWork && !unit.doneAt && order.status === 'CONFIRMED' ? (
                <span className="flex gap-1.5">
                  {!unit.startedAt ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ kind: 'start', unitId: unit.id })}
                    >
                      Start
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    className="h-7"
                    disabled={act.isPending}
                    onClick={() => act.mutate({ kind: 'done', unitId: unit.id })}
                  >
                    {busy(unit.id) ? <Loader2 className="animate-spin" /> : null}
                    Done
                  </Button>
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {canForce && order.status === 'CONFIRMED' && !order.kitchenReadyAt ? (
        <Button
          variant="ghost"
          size="sm"
          className="self-start text-muted-foreground"
          disabled={act.isPending}
          onClick={() => {
            if (window.confirm(`Mark every unit of ${formatOrderNumber(order.number)} done?`)) {
              act.mutate({ kind: 'force' });
            }
          }}
        >
          <Zap /> Force-complete order
        </Button>
      ) : null}
    </Card>
  );
}

function RiskBadge({
  order,
  minutesFromNow,
  hhmm,
}: {
  order: KitchenOrderDto;
  minutesFromNow: number;
  hhmm: (iso: string) => string;
}) {
  switch (order.risk) {
    case 'READY':
      return (
        <Badge variant="success">
          <CheckCircle2 /> {order.status === 'DELIVERED' ? 'Delivered' : 'Ready'}
          {order.kitchenReadyAt ? ` ${hhmm(order.kitchenReadyAt)}` : ''}
        </Badge>
      );
    case 'LATE':
      return (
        <Badge variant="destructive">
          <Flame /> Late by {Math.max(1, -minutesFromNow)} min
        </Badge>
      );
    case 'AT_RISK':
      return (
        <Badge variant="warning">
          <TriangleAlert /> Due in {minutesFromNow} min
        </Badge>
      );
    case 'ON_TRACK':
      return <Badge variant="outline">On track</Badge>;
  }
}

/** What to batch-cook: meals per dish and per combination of choices, by station. */
function Production({
  board,
  station,
  stationNames,
}: {
  board: KitchenBoardDto;
  station: StationFilter;
  stationNames: Map<string | null, string>;
}) {
  const lines = board.production.filter(
    (line) => station.kind === 'all' || line.stationId === station.id,
  );
  if (lines.length === 0) {
    return (
      <Card className="items-center p-10 text-sm text-muted-foreground">Nothing to cook here.</Card>
    );
  }
  return (
    <Card className="gap-0 divide-y py-0">
      {lines.map((line) => (
        <div
          key={`${line.stationId}|${line.dishName}`}
          className="flex flex-wrap items-start gap-4 p-4"
        >
          <div className="w-56 min-w-0">
            <p className="font-semibold">{line.dishName}</p>
            <p className="text-xs text-muted-foreground">
              {stationNames.get(line.stationId) ?? 'Unassigned'}
            </p>
          </div>
          <div className="w-28 text-sm tabular-nums">
            <p className="font-display text-2xl font-semibold">{line.meals}</p>
            <p className="text-xs text-muted-foreground">{line.mealsDone} done</p>
          </div>
          <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {line.combinations.map((combo) => (
              <li
                key={combo.choices.join('|')}
                className="rounded-full border bg-card px-2.5 py-0.5 text-sm"
              >
                <strong className="tabular-nums">{combo.meals}</strong> ×{' '}
                {combo.choices.length > 0 ? combo.choices.join(', ') : 'as it comes'}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Card>
  );
}
