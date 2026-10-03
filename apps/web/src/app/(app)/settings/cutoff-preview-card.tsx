'use client';

import type { CutoffPreviewDay } from '@fernleaf/shared';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatInstant, formatIsoDate } from '@/lib/format';

export const cutoffPreviewQueryKey = ['cutoff-preview'] as const;

/** The next two weeks of delivery dates and when each one locks, under the saved settings. */
export function CutoffPreviewCard({ timeZone }: { timeZone: string }) {
  const preview = useQuery({
    queryKey: cutoffPreviewQueryKey,
    queryFn: () => api.get<CutoffPreviewDay[]>('/settings/cutoff-preview?days=14'),
    refetchInterval: 60_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>When orders lock</CardTitle>
        <CardDescription>
          The next 14 delivery dates under the saved settings. Times are kitchen time.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2">
        {preview.isPending ? (
          <Skeleton className="mx-3 h-72" />
        ) : preview.isError ? (
          <p className="px-3 text-sm text-destructive">{preview.error.message}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Delivery</TableHead>
                <TableHead>Orders lock</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.data.map((day) => (
                <TableRow key={day.date}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {formatIsoDate(day.date)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {day.cutoffAt
                      ? formatInstant(day.cutoffAt, timeZone)
                      : (day.holidayName ?? 'Kitchen not working')}
                  </TableCell>
                  <TableCell className="text-right">
                    {!day.kitchenOpen ? (
                      <Badge variant="secondary">Closed</Badge>
                    ) : day.locked ? (
                      <Badge variant="outline">Locked</Badge>
                    ) : (
                      <Badge variant="success">Open</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
