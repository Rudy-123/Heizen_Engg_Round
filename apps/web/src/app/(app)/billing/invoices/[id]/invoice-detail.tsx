'use client';

import {
  CREDIT_REASON_LABELS,
  formatCents,
  formatInvoiceNumber,
  formatOrderNumber,
  type InvoiceDetailDto,
} from '@fernleaf/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleCheck, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { OrderStatusBadge } from '@/components/order-status-badge';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
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
import { api, ApiError } from '@/lib/api';
import { billingKey, useInvoice } from '@/lib/billing-queries';
import { formatInstant, formatIsoDate } from '@/lib/format';
import { useKitchenTimeZone } from '@/lib/kitchen-clock';
import { useCan } from '@/lib/session';

/** An issued invoice: its orders, credits and totals. It never changes once issued. */
export function InvoiceDetail({ id }: { id: string }) {
  const invoice = useInvoice(id);
  const canWrite = useCan('BILLING_WRITE');
  const zone = useKitchenTimeZone() ?? 'Asia/Kolkata';
  const queryClient = useQueryClient();
  const pay = useMutation({
    mutationFn: () => api.post<InvoiceDetailDto>(`/billing/invoices/${id}/pay`),
    onSuccess: (result) => {
      queryClient.setQueryData([...billingKey, 'invoice', id], result);
      void queryClient.invalidateQueries({ queryKey: billingKey });
      toast.success(`${formatInvoiceNumber(result.number)} marked paid`);
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not mark it paid.'),
  });

  const back = (
    <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
      <Link href="/billing">
        <ArrowLeft /> Billing
      </Link>
    </Button>
  );
  if (invoice.isPending) {
    return (
      <div className="space-y-4">
        {back}
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-80" />
      </div>
    );
  }
  if (invoice.isError) {
    return (
      <div>
        {back}
        <p className="text-sm text-destructive">{invoice.error.message}</p>
      </div>
    );
  }
  const data = invoice.data;
  const when = (iso: string) =>
    formatInstant(iso, zone, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        {back}
        <PageHeader
          title={formatInvoiceNumber(data.number)}
          description={`${data.company.name} · issued ${when(data.issuedAt)}${data.issuedByName ? ` by ${data.issuedByName}` : ''}`}
          actions={
            <>
              <Badge
                variant={data.status === 'PAID' ? 'success' : 'warning'}
                className="px-3 py-1 text-sm"
              >
                {data.status === 'PAID' ? `Paid ${data.paidAt ? when(data.paidAt) : ''}` : 'Unpaid'}
              </Badge>
              {canWrite && data.status === 'ISSUED' ? (
                <Button onClick={() => pay.mutate()} disabled={pay.isPending}>
                  {pay.isPending ? <Loader2 className="animate-spin" /> : <CircleCheck />}
                  Mark paid
                </Button>
              ) : null}
            </>
          }
        />
      </div>

      <Card>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground">Bill to</p>
            <p className="font-medium">{data.billTo.contactName}</p>
            <p>{data.billTo.email}</p>
            {data.billTo.phone ? <p>{data.billTo.phone}</p> : null}
            <p className="text-muted-foreground">{data.billTo.address}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Deliveries</p>
            <p className="font-medium">
              {data.periodStart && data.periodEnd
                ? data.periodStart === data.periodEnd
                  ? formatIsoDate(data.periodStart)
                  : `${formatIsoDate(data.periodStart)} – ${formatIsoDate(data.periodEnd)}`
                : 'Credits only'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Total (pre-tax, no fees)</p>
            <p className="font-display text-3xl font-semibold tabular-nums">
              {formatCents(data.totalCents)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>Orders</CardTitle>
        </CardHeader>
        {data.orders.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No orders - this invoice only carries credits.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Meals</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link
                      href={`/orders/${order.id}`}
                      className="font-mono text-sm font-semibold hover:underline"
                    >
                      {formatOrderNumber(order.number)}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatIsoDate(order.deliveryDate)}
                  </TableCell>
                  <TableCell>
                    {order.employeeName}
                    {order.status === 'CANCELLED' || order.status === 'REJECTED' ? (
                      <OrderStatusBadge status={order.status} className="ml-2" />
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{order.mealCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(order.totalCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {data.adjustments.length > 0 ? (
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-4">
            <CardTitle>Credits</CardTitle>
          </CardHeader>
          <Table>
            <TableBody>
              {data.adjustments.map((credit) => (
                <TableRow key={credit.id}>
                  <TableCell>
                    <Link
                      href={`/orders/${credit.orderId}`}
                      className="font-mono text-sm font-semibold hover:underline"
                    >
                      {formatOrderNumber(credit.orderNumber)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{CREDIT_REASON_LABELS[credit.reason]}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{credit.note}</TableCell>
                  <TableCell className="text-right text-success tabular-nums">
                    {formatCents(credit.amountCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}

      <Card className="ml-auto max-w-xs gap-1.5 p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Orders</span>
          <span className="tabular-nums">{formatCents(data.ordersTotalCents)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Credits</span>
          <span className="text-success tabular-nums">
            {formatCents(data.adjustmentsTotalCents)}
          </span>
        </div>
        <div className="flex justify-between border-t pt-2 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatCents(data.totalCents)}</span>
        </div>
      </Card>
    </div>
  );
}
