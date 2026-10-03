'use client';

import {
  DROP_STAGE_LABELS,
  DROP_STAGES,
  formatOrderNumber,
  minutesToTime,
  type DispatchBoardDto,
  type DropDto,
  type DropStage,
} from '@fernleaf/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ImageIcon,
  Loader2,
  PackageCheck,
  Truck,
  TriangleAlert,
  UserX,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { DeliverDialog } from '@/components/deliver-dialog';
import { DropStageBadge } from '@/components/drop-stage-badge';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { selectClassName } from '@/lib/catalogue-queries';
import { addDays } from '@/lib/dates';
import { formatInstant, formatIsoDate } from '@/lib/format';
import { useKitchenTimeZone, useKitchenToday } from '@/lib/kitchen-clock';
import { dispatchBoardKey, useDispatchBoard } from '@/lib/operations-queries';
import { useCan } from '@/lib/session';
import { cn } from '@/lib/utils';

/**
 * Spec 4.8: drops (same company, address and delivery time) and where each one is:
 * kitchen ready -> dispatch ready -> out for delivery -> delivered. Each step needs the one
 * before; the server refuses a repeat or a skipped step. Refreshes itself every 20 seconds.
 */
export function DispatchBoard() {
  const today = useKitchenToday();
  const [chosenDate, setChosenDate] = useState<string | null>(null);
  const date = chosenDate ?? today;
  const board = useDispatchBoard(date);
  const [stage, setStage] = useState<DropStage | 'ALL' | 'ACTION'>('ALL');

  return (
    <div>
      <PageHeader
        title="Dispatch board"
        description="Drops leaving the kitchen, their drivers, and what is running late. Times are kitchen time."
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
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : board.isError ? (
        <p className="text-sm text-destructive">{board.error.message}</p>
      ) : (
        <BoardBody board={board.data} stage={stage} setStage={setStage} />
      )}
    </div>
  );
}

const needsAction = (drop: DropDto) =>
  drop.stage !== 'DELIVERED' && (!drop.driver || drop.lateLeaving || drop.lateDelivering);

function BoardBody({
  board,
  stage,
  setStage,
}: {
  board: DispatchBoardDto;
  stage: DropStage | 'ALL' | 'ACTION';
  setStage: (stage: DropStage | 'ALL' | 'ACTION') => void;
}) {
  const count = (s: DropStage) => board.drops.filter((d) => d.stage === s).length;
  const withoutDriver = board.drops.filter((d) => d.stage !== 'DELIVERED' && !d.driver).length;
  const lateLeaving = board.drops.filter((d) => d.lateLeaving).length;
  const lateOnRoad = board.drops.filter(
    (d) => d.stage === 'OUT_FOR_DELIVERY' && d.lateDelivering,
  ).length;
  const delivered = board.drops.filter((d) => d.stage === 'DELIVERED');
  const onTime = delivered.filter((d) => d.deliveredOnTime).length;
  const shown = board.drops.filter((drop) =>
    stage === 'ALL' ? true : stage === 'ACTION' ? needsAction(drop) : drop.stage === stage,
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Drops today"
          value={board.drops.length}
          note={`${board.drops.reduce((s, d) => s + d.meals, 0)} meals`}
        />
        <Tile
          label="Without a driver"
          value={withoutDriver}
          note="Not delivered yet"
          tone={withoutDriver > 0 ? 'warning' : undefined}
        />
        <Tile
          label="Running late"
          value={lateLeaving + lateOnRoad}
          note={`${lateLeaving} should have left · ${lateOnRoad} late on the road`}
          tone={lateLeaving + lateOnRoad > 0 ? 'danger' : undefined}
        />
        <Tile
          label="On time"
          value={delivered.length > 0 ? `${Math.round((onTime / delivered.length) * 100)}%` : '-'}
          note={`${onTime} of ${delivered.length} delivered drops (≤ ${board.onTimeGraceMinutes} min after the agreed time)`}
        />
      </div>

      {board.ordersWithoutDrop.length > 0 ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>
            {board.ordersWithoutDrop.length} confirmed{' '}
            {board.ordersWithoutDrop.length === 1 ? 'order has' : 'orders have'} no drop
          </AlertTitle>
          <AlertDescription>
            Their drop had already left when they were confirmed. An admin can change their delivery
            time to send them in another drop:{' '}
            {board.ordersWithoutDrop.map((order, index) => (
              <span key={order.id}>
                {index > 0 ? ', ' : ''}
                <Link href={`/orders/${order.id}`} className="font-medium underline">
                  {formatOrderNumber(order.number)}
                </Link>{' '}
                ({order.companyName}, {minutesToTime(order.deliveryTimeMinutes)})
              </span>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip
          active={stage === 'ALL'}
          onClick={() => setStage('ALL')}
          label="All"
          count={board.drops.length}
        />
        <Chip
          active={stage === 'ACTION'}
          onClick={() => setStage('ACTION')}
          label="Needs action"
          count={board.drops.filter(needsAction).length}
          urgent
        />
        <span className="mx-1 h-5 w-px bg-border" />
        {DROP_STAGES.map((s) => (
          <Chip
            key={s}
            active={stage === s}
            onClick={() => setStage(s)}
            label={DROP_STAGE_LABELS[s]}
            count={count(s)}
          />
        ))}
      </div>

      {shown.length === 0 ? (
        <Card className="items-center p-10 text-sm text-muted-foreground">
          {board.drops.length === 0
            ? `No drops for ${formatIsoDate(board.date)} yet - drops appear when orders are confirmed at the cut-off.`
            : 'No drops here.'}
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((drop) => (
            <DropRow key={drop.id} board={board} drop={drop} />
          ))}
        </div>
      )}

      {board.drivers.length > 0 ? (
        <Card className="gap-2 p-4">
          <p className="text-sm font-semibold">Driver load</p>
          <ul className="flex flex-wrap gap-2 text-sm">
            {board.drivers.map((driver) => (
              <li key={driver.id} className="rounded-full border px-3 py-1">
                {driver.name}{' '}
                <span className="text-muted-foreground tabular-nums">
                  · {driver.delivered}/{driver.drops} delivered
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function Tile({
  label,
  value,
  note,
  tone,
}: {
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
      <p className="text-sm text-muted-foreground">{label}</p>
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

function Chip({
  active,
  onClick,
  label,
  count,
  urgent,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  urgent?: boolean;
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
          active
            ? 'bg-primary-foreground/20'
            : urgent && count > 0
              ? 'bg-destructive/15 text-destructive'
              : 'bg-muted',
        )}
      >
        {count}
      </span>
    </Button>
  );
}

function DropRow({ board, drop }: { board: DispatchBoardDto; drop: DropDto }) {
  const zone = useKitchenTimeZone() ?? 'Asia/Kolkata';
  const canManage = useCan('DISPATCH_MANAGE');
  const canDeliverAny = useCan('DELIVERIES_ANY');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const hhmm = (iso: string) =>
    formatInstant(iso, zone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  const replace = (updated: DropDto) => {
    queryClient.setQueryData<DispatchBoardDto>(dispatchBoardKey(board.date), (old) =>
      old ? { ...old, drops: old.drops.map((d) => (d.id === updated.id ? updated : d)) } : old,
    );
    void queryClient.invalidateQueries({ queryKey: dispatchBoardKey(board.date) });
  };
  const act = useMutation({
    mutationFn: (
      action:
        | { kind: 'dispatch-ready' | 'out-for-delivery' }
        | { kind: 'driver'; driverId: string | null },
    ) =>
      action.kind === 'driver'
        ? api.put<DropDto>(`/dispatch/drops/${drop.id}/driver`, { driverId: action.driverId })
        : api.post<DropDto>(`/dispatch/drops/${drop.id}/${action.kind}`),
    onSuccess: (updated, action) => {
      replace(updated);
      toast.success(
        action.kind === 'driver'
          ? updated.driver
            ? `${updated.driver.name} takes the ${minutesToTime(drop.deliveryTimeMinutes)} ${drop.company.name} drop`
            : 'Driver taken off the drop'
          : action.kind === 'dispatch-ready'
            ? 'Marked dispatch ready'
            : `Out for delivery with ${updated.driver?.name ?? 'the driver'}`,
      );
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not save that.');
      void queryClient.invalidateQueries({ queryKey: dispatchBoardKey(board.date) });
    },
  });
  const left = drop.outForDeliveryAt !== null;

  return (
    <Card
      className={cn(
        'gap-0 py-0',
        (drop.lateLeaving || drop.lateDelivering) && drop.stage !== 'DELIVERED'
          ? 'border-destructive/50'
          : undefined,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 p-4">
        <div className="w-16">
          <p className="font-display text-2xl leading-none font-semibold tabular-nums">
            {minutesToTime(drop.deliveryTimeMinutes)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            leave by {hhmm(drop.plannedDispatchReadyAt)}
          </p>
        </div>
        <div className="min-w-0 flex-[1_1_14rem]">
          <p className="font-semibold">{drop.company.name}</p>
          <p className="truncate text-sm text-muted-foreground">{drop.addressText}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {drop.meals} meals · {drop.orders.length}{' '}
            {drop.orders.length === 1 ? 'order' : 'orders'} · kitchen ready {drop.ordersReady}/
            {drop.orders.length}
          </p>
        </div>
        <div className="w-44">
          <select
            className={cn(
              selectClassName,
              'h-9',
              !drop.driver && 'border-warning text-warning-foreground',
            )}
            aria-label="Driver"
            value={drop.driver?.id ?? ''}
            disabled={!canManage || left || act.isPending}
            onChange={(event) =>
              act.mutate({ kind: 'driver', driverId: event.target.value || null })
            }
          >
            <option value="">No driver yet</option>
            {drop.driver && !board.drivers.some((d) => d.id === drop.driver?.id) ? (
              <option value={drop.driver.id}>{drop.driver.name}</option>
            ) : null}
            {board.drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex w-44 flex-col items-start gap-1">
          <DropStageBadge stage={drop.stage} />
          {drop.stage === 'DELIVERED' && drop.deliveredAt ? (
            <span
              className={cn(
                'text-xs font-medium',
                drop.deliveredOnTime ? 'text-success' : 'text-destructive',
              )}
            >
              {hhmm(drop.deliveredAt)} · {drop.deliveredOnTime ? 'on time' : 'late'}
            </span>
          ) : drop.lateDelivering && left ? (
            <span className="flex items-center gap-1 text-xs font-medium text-destructive">
              <Clock className="size-3" /> Past delivery time
            </span>
          ) : drop.lateLeaving ? (
            <span className="flex items-center gap-1 text-xs font-medium text-destructive">
              <Clock className="size-3" /> Should have left
            </span>
          ) : !drop.driver ? (
            <span className="flex items-center gap-1 text-xs font-medium text-warning-foreground">
              <UserX className="size-3" /> Needs a driver
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <NextStep
            drop={drop}
            canManage={canManage}
            canDeliverAny={canDeliverAny}
            pending={act.isPending}
            onStep={(kind) => act.mutate({ kind })}
            onDeliver={() => setDelivering(true)}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={open ? 'Hide orders' : 'Show orders'}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
          </Button>
        </div>
      </div>

      {open ? (
        <div className="space-y-3 border-t bg-muted/30 p-4 text-sm">
          {drop.instructions.length > 0 ? (
            <p>
              <span className="font-medium">For the driver:</span> {drop.instructions.join(' · ')}
            </p>
          ) : null}
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {drop.orders.map((order) => (
              <li key={order.id} className="flex items-center gap-2">
                {order.kitchenReadyAt ? (
                  <CheckCircle2
                    className="size-4 shrink-0 text-success"
                    aria-label="Kitchen ready"
                  />
                ) : (
                  <Loader2
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-label="In the kitchen"
                  />
                )}
                <span className="font-mono text-xs">{formatOrderNumber(order.number)}</span>
                <span className="truncate">{order.employeeName}</span>
                <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
                  {order.meals} · {order.packagingName}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {drop.dispatchReadyAt ? <span>Dispatch ready {hhmm(drop.dispatchReadyAt)}</span> : null}
            {drop.outForDeliveryAt ? <span>Left {hhmm(drop.outForDeliveryAt)}</span> : null}
            {drop.deliveredAt ? <span>Delivered {hhmm(drop.deliveredAt)}</span> : null}
            {drop.deliveryNote ? <span>Note: “{drop.deliveryNote}”</span> : null}
            {drop.hasPhoto ? (
              <a
                href={`/api/dispatch/drops/${drop.id}/photo`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 font-medium text-primary underline"
              >
                <ImageIcon className="size-3.5" /> Delivery photo
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {delivering ? (
        <DeliverDialog
          drop={drop}
          path={`/dispatch/drops/${drop.id}/deliver`}
          onClose={() => setDelivering(false)}
          onDelivered={replace}
        />
      ) : null}
    </Card>
  );
}

function NextStep({
  drop,
  canManage,
  canDeliverAny,
  pending,
  onStep,
  onDeliver,
}: {
  drop: DropDto;
  canManage: boolean;
  canDeliverAny: boolean;
  pending: boolean;
  onStep: (kind: 'dispatch-ready' | 'out-for-delivery') => void;
  onDeliver: () => void;
}) {
  switch (drop.stage) {
    case 'AWAITING_KITCHEN':
      return (
        <Badge variant="outline" className="h-8 px-3">
          Waiting for the kitchen
        </Badge>
      );
    case 'KITCHEN_READY':
      return canManage ? (
        <Button size="sm" disabled={pending} onClick={() => onStep('dispatch-ready')}>
          <PackageCheck /> Mark dispatch ready
        </Button>
      ) : null;
    case 'DISPATCH_READY':
      return canManage ? (
        <Button
          size="sm"
          disabled={pending || !drop.driver}
          title={drop.driver ? undefined : 'Assign a driver first'}
          onClick={() => onStep('out-for-delivery')}
        >
          <Truck /> Send out
        </Button>
      ) : null;
    case 'OUT_FOR_DELIVERY':
      return canDeliverAny ? (
        <Button size="sm" variant="outline" onClick={onDeliver}>
          <CheckCircle2 /> Mark delivered
        </Button>
      ) : (
        <span className="text-xs text-muted-foreground">With {drop.driver?.name}</span>
      );
    case 'DELIVERED':
      return null;
  }
}
