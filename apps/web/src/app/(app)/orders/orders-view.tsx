'use client';

import {
  formatCents,
  formatOrderNumber,
  minutesToTime,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
} from '@fernleaf/shared';
import { Plus, Receipt, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useState } from 'react';
import { OrderStatusBadge } from '@/components/order-status-badge';
import { PageHeader } from '@/components/page-header';
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
import { selectClassName } from '@/lib/catalogue-queries';
import { formatIsoDate } from '@/lib/format';
import { useKitchenToday } from '@/lib/kitchen-clock';
import { useCompanies } from '@/lib/company-queries';
import { useOrders } from '@/lib/order-queries';
import { useCan } from '@/lib/session';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

/** Calendar-date arithmetic in UTC, so the browser's zone can't shift the day. */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function OrdersView() {
  const router = useRouter();
  const canCreate = useCan('ORDERS_WRITE');
  const today = useKitchenToday();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [invoiced, setInvoiced] = useState<'yes' | 'no' | 'all'>('all');
  const [companyId, setCompanyId] = useState('');
  const companies = useCompanies();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search.trim());
  const orders = useOrders({
    from,
    to,
    status: statuses,
    companyId,
    invoiced,
    search: deferredSearch,
    page,
    pageSize: PAGE_SIZE,
  });

  const reset = () => setPage(1);
  const setRange = (start: string, end: string) => {
    setFrom(start);
    setTo(end);
    reset();
  };
  const data = orders.data;
  const first = data ? (data.page - 1) * data.pageSize + 1 : 0;
  const last = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Every order, with its lines, money and progress. Times are kitchen time."
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/orders/new">
                <Plus /> New order
              </Link>
            </Button>
          ) : null
        }
      />

      <Card className="gap-0 py-0">
        <div className="space-y-3 border-b p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-[1_1_16rem]">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Order number, employee name or email"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  reset();
                }}
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Input
                type="date"
                className="w-40"
                aria-label="Delivery from"
                value={from}
                onChange={(event) => setRange(event.target.value, to)}
              />
              <span className="text-muted-foreground">to</span>
              <Input
                type="date"
                className="w-40"
                aria-label="Delivery to"
                value={to}
                onChange={(event) => setRange(from, event.target.value)}
              />
            </div>
            <select
              className={cn(selectClassName, 'w-48')}
              value={companyId}
              aria-label="Company"
              onChange={(event) => {
                setCompanyId(event.target.value);
                reset();
              }}
            >
              <option value="">All companies</option>
              {(companies.data ?? []).map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            <select
              className={cn(selectClassName, 'w-40')}
              value={invoiced}
              aria-label="Invoiced"
              onChange={(event) => {
                setInvoiced(event.target.value as typeof invoiced);
                reset();
              }}
            >
              <option value="all">Invoiced or not</option>
              <option value="yes">Invoiced</option>
              <option value="no">Not invoiced</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {today ? (
              <>
                <Button
                  size="sm"
                  variant={from === today && to === today ? 'default' : 'outline'}
                  onClick={() => setRange(today, today)}
                >
                  Today
                </Button>
                <Button
                  size="sm"
                  variant={from === today && to === addDays(today, 6) ? 'default' : 'outline'}
                  onClick={() => setRange(today, addDays(today, 6))}
                >
                  Next 7 days
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRange('', '')}>
                  Any date
                </Button>
                <span className="mx-1 h-5 w-px bg-border" />
              </>
            ) : null}
            {ORDER_STATUSES.map((status) => {
              const on = statuses.includes(status);
              return (
                <Button
                  key={status}
                  size="sm"
                  variant={on ? 'default' : 'outline'}
                  aria-pressed={on}
                  onClick={() => {
                    setStatuses(on ? statuses.filter((s) => s !== status) : [...statuses, status]);
                    reset();
                  }}
                >
                  {ORDER_STATUS_LABELS[status]}
                </Button>
              );
            })}
          </div>
        </div>

        {orders.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : orders.isError ? (
          <p className="p-4 text-sm text-destructive">{orders.error.message}</p>
        ) : data && data.items.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">No orders match.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Meals</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.items ?? []).map((order) => (
                <TableRow
                  key={order.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/orders/${order.id}`)}
                >
                  <TableCell>
                    <Link
                      href={`/orders/${order.id}`}
                      className="font-mono text-sm font-semibold hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {formatOrderNumber(order.number)}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatIsoDate(order.deliveryDate)}
                    <span className="ml-1.5 text-muted-foreground tabular-nums">
                      {minutesToTime(order.deliveryTimeMinutes)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{order.employee.name}</p>
                    <p className="text-xs text-muted-foreground">{order.company.name}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{order.mealCount}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCents(order.totalCents)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {order.isInvoiced ? (
                        <Receipt className="size-3.5 text-muted-foreground" aria-label="Invoiced" />
                      ) : null}
                      <OrderStatusBadge status={order.status} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {data && data.total > 0 ? (
          <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground tabular-nums">
              {first}–{last} of {data.total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={last >= data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
