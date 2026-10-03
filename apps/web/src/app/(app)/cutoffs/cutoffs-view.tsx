'use client';

import type { CutoffDayDto, CutoffRunDto } from '@fernleaf/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Hourglass, Loader2, Lock, Play, Unlock } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, ApiError } from '@/lib/api';
import { formatInstant, formatIsoDate } from '@/lib/format';
import { useKitchenTimeZone, useKitchenToday } from '@/lib/kitchen-clock';
import { cutoffsQueryKey, ordersQueryKey, useCutoffs } from '@/lib/order-queries';

/**
 * Spec 4.6: orders for a delivery date lock at its cut-off; then drafts are cancelled and
 * placed orders confirmed. This page shows every date's lock time and lets staff run the
 * processing by hand - running it twice is safe.
 */
export function CutoffsView() {
  const cutoffs = useCutoffs();
  const zone = useKitchenTimeZone() ?? 'Asia/Kolkata';
  const today = useKitchenToday();
  const queryClient = useQueryClient();
  const run = useMutation({
    mutationFn: (date: string) => api.post<CutoffRunDto>(`/cutoffs/${date}/run`),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: cutoffsQueryKey });
      void queryClient.invalidateQueries({ queryKey: ordersQueryKey });
      toast.success(
        result.confirmedCount + result.cancelledCount === 0
          ? `Nothing left to do for ${formatIsoDate(result.deliveryDate)} - it was already processed.`
          : `${formatIsoDate(result.deliveryDate)}: ${result.confirmedCount} confirmed, ${result.cancelledCount} drafts cancelled.`,
      );
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not run the cut-off.'),
  });
  const time = (iso: string) => formatInstant(iso, zone);

  return (
    <div>
      <PageHeader
        title="Cut-offs"
        description="Orders for a delivery date lock at its cut-off. Then every draft is cancelled and every placed order is confirmed - billable to its company."
      />

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          {cutoffs.data ? (
            cutoffs.data.autoProcessing ? (
              <span className="flex items-center gap-2">
                <CircleCheck className="size-4 text-success" /> Processed automatically, every 5
                minutes, once a cut-off passes.
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Hourglass className="size-4 text-warning-foreground" /> Automatic processing is off
                (Settings) - use “Run now”.
              </span>
            )
          ) : null}
          <span className="text-muted-foreground">
            “Run now” works for any date whose cut-off has passed, and is safe to press twice. Lock
            times follow the{' '}
            <Link href="/settings" className="underline">
              kitchen calendar
            </Link>
            .
          </span>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        {cutoffs.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : cutoffs.isError ? (
          <p className="p-4 text-sm text-destructive">{cutoffs.error.message}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Delivery date</TableHead>
                <TableHead>Orders lock</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead className="text-right">Run</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cutoffs.data.days.map((day) => (
                <TableRow key={day.date} className={day.isDue ? 'bg-warning/10' : undefined}>
                  <TableCell className="whitespace-nowrap">
                    <span className="font-medium">{formatIsoDate(day.date)}</span>
                    {day.date === today ? <Badge className="ml-2">Today</Badge> : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {!day.kitchenOpen ? (
                      <span className="text-muted-foreground">Kitchen closed</span>
                    ) : day.cutoffAt ? (
                      <span className="flex items-center gap-1.5">
                        {day.isLocked ? (
                          <Lock className="size-3.5 text-muted-foreground" />
                        ) : (
                          <Unlock className="size-3.5 text-success" />
                        )}
                        {time(day.cutoffAt)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Counts day={day} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {day.lastRun ? (
                      <>
                        {time(day.lastRun.ranAt)} · {day.lastRun.actorName ?? 'automatic'} ·{' '}
                        {day.lastRun.confirmedCount} confirmed, {day.lastRun.cancelledCount}{' '}
                        cancelled
                      </>
                    ) : day.isDue ? (
                      <span className="font-medium text-warning-foreground">
                        Due - waiting to run
                      </span>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {day.isLocked ? (
                      <Button
                        size="sm"
                        variant={day.isDue ? 'default' : 'outline'}
                        disabled={run.isPending}
                        onClick={() => run.mutate(day.date)}
                      >
                        {run.isPending && run.variables === day.date ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Play />
                        )}
                        Run now
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Open for orders</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function Counts({ day }: { day: CutoffDayDto }) {
  const parts: [string, number, string][] = [
    ['drafts', day.counts.DRAFT, 'text-muted-foreground'],
    ['placed', day.counts.PLACED, 'text-accent-foreground'],
    ['confirmed', day.counts.CONFIRMED, 'text-primary'],
    ['delivered', day.counts.DELIVERED, 'text-success'],
    ['cancelled', day.counts.CANCELLED + day.counts.REJECTED, 'text-muted-foreground'],
  ];
  const shown = parts.filter(([, count]) => count > 0);
  if (shown.length === 0) return <span className="text-sm text-muted-foreground">No orders</span>;
  return (
    <span className="flex flex-wrap gap-x-3 text-sm">
      {shown.map(([label, count, color]) => (
        <span key={label} className={color}>
          <strong className="tabular-nums">{count}</strong> {label}
        </span>
      ))}
    </span>
  );
}
