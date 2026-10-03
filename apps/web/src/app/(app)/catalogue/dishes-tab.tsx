'use client';

import { formatCents } from '@fernleaf/shared';
import { Flame, Plus, Search, Snowflake, UtensilsCrossed } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { selectClassName, useDishes } from '@/lib/catalogue-queries';
import { useCan } from '@/lib/session';
import { cn } from '@/lib/utils';

export function DishesTab() {
  const router = useRouter();
  const canEdit = useCan('CATALOGUE_WRITE');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('all');
  const dishes = useDishes(useDeferredValue(search.trim()), status);

  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center gap-3 border-b p-4">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name or SKU"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select
          className={cn(selectClassName, 'w-36')}
          value={status}
          onChange={(event) => setStatus(event.target.value as typeof status)}
          aria-label="Show"
        >
          <option value="all">All dishes</option>
          <option value="active">Active</option>
          <option value="inactive">Switched off</option>
        </select>
        {canEdit ? (
          <Button asChild>
            <Link href="/catalogue/dishes/new">
              <Plus /> New dish
            </Link>
          </Button>
        ) : null}
      </div>

      {dishes.isPending ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : dishes.isError ? (
        <p className="p-4 text-sm text-destructive">{dishes.error.message}</p>
      ) : dishes.data.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">No dishes match.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dish</TableHead>
              <TableHead>Temp.</TableHead>
              <TableHead>Station</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Option groups</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dishes.data.map((dish) => (
              <TableRow
                key={dish.id}
                className="cursor-pointer"
                onClick={() => router.push(`/catalogue/dishes/${dish.id}`)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    {dish.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={dish.imageUrl} alt="" className="size-10 rounded-lg object-cover" />
                    ) : (
                      <span className="flex size-10 items-center justify-center rounded-lg bg-accent">
                        <UtensilsCrossed className="size-4 text-primary/70" />
                      </span>
                    )}
                    <div>
                      <Link
                        href={`/catalogue/dishes/${dish.id}`}
                        className="font-medium hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {dish.name}
                      </Link>
                      <p className="font-mono text-xs text-muted-foreground">{dish.sku}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {dish.temperature === 'HOT' ? (
                    <span className="inline-flex items-center gap-1 text-sm">
                      <Flame className="size-3.5 text-destructive" /> Hot
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-sm">
                      <Snowflake className="size-3.5 text-sky-600" /> Cold
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {dish.kitchenStation?.name ?? 'Unassigned'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {dish.costCents === null ? '—' : formatCents(dish.costCents)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{dish.optionGroupCount}</TableCell>
                <TableCell className="text-right">
                  {dish.isActive ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Switched off</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
