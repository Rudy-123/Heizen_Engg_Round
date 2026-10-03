'use client';

import { DROP_STAGE_LABELS, DROP_STAGES, minutesToTime, type DropDto } from '@fernleaf/shared';
import { ArrowRight, CircleCheck, Clock, UserX } from 'lucide-react';
import Link from 'next/link';
import { StatTile } from '@/components/stat-tile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useKitchenToday } from '@/lib/kitchen-clock';
import { useDispatchBoard } from '@/lib/operations-queries';

/**
 * Dispatcher: "what leaves next, who takes it, and what's late?" Built from the dispatch
 * board's data for today, so every number matches the board. No money.
 */
export function DispatchDashboard() {
  const today = useKitchenToday();
  const board = useDispatchBoard(today);

  if (board.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }
  if (board.isError) return <p className="text-sm text-destructive">{board.error.message}</p>;

  const drops = board.data.drops;
  const delivered = drops.filter((d) => d.stage === 'DELIVERED');
  const onTime = delivered.filter((d) => d.deliveredOnTime).length;
  const open = drops.filter((d) => d.stage !== 'DELIVERED');
  const issues: { drop: DropDto; issue: string; icon: typeof Clock }[] = [
    ...open
      .filter((d) => d.stage === 'OUT_FOR_DELIVERY' && d.lateDelivering)
      .map((drop) => ({ drop, issue: 'Past its delivery time, still on the road', icon: Clock })),
    ...open
      .filter((d) => d.lateLeaving)
      .map((drop) => ({ drop, issue: 'Should have left the kitchen by now', icon: Clock })),
    ...open
      .filter((d) => !d.driver)
      .map((drop) => ({ drop, issue: 'No driver assigned', icon: UserX })),
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {DROP_STAGES.map((stage) => (
          <StatTile
            key={stage}
            label={DROP_STAGE_LABELS[stage]}
            value={drops.filter((d) => d.stage === stage).length}
          />
        ))}
        <StatTile
          icon={<CircleCheck />}
          label="On time"
          value={delivered.length > 0 ? `${Math.round((onTime / delivered.length) * 100)}%` : '-'}
          note={`${onTime} of ${delivered.length} delivered drops`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Needs action</CardTitle>
            <Button size="sm" asChild>
              <Link href="/dispatch">
                Open the board <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {issues.length === 0 ? (
              <p className="flex items-center gap-2 text-success">
                <CircleCheck className="size-4" /> Nothing needs you right now.
              </p>
            ) : null}
            {issues.map(({ drop, issue, icon: Icon }) => (
              <div
                key={`${drop.id}-${issue}`}
                className="flex items-center gap-3 rounded-lg border px-3 py-2"
              >
                <Icon className="size-4 shrink-0 text-destructive" />
                <span className="w-12 font-semibold tabular-nums">
                  {minutesToTime(drop.deliveryTimeMinutes)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {drop.company.name} · {drop.meals} meals
                </span>
                <span className="text-xs text-muted-foreground">{issue}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-4">
            <CardTitle>Drivers today</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">Next drop</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {board.data.drivers.map((driver) => {
                const next = open.find((d) => d.driver?.id === driver.id);
                return (
                  <TableRow key={driver.id}>
                    <TableCell className="font-medium">{driver.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {driver.delivered} / {driver.drops}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {next
                        ? `${minutesToTime(next.deliveryTimeMinutes)} ${next.company.name}`
                        : '-'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
