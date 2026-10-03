'use client';

import {
  CREDIT_REASON_LABELS,
  formatCents,
  formatInvoiceNumber,
  formatOrderNumber,
  type InvoiceDetailDto,
} from '@fernleaf/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
import { billingKey, useCompanyBilling } from '@/lib/billing-queries';
import { formatIsoDate } from '@/lib/format';
import { ordersQueryKey } from '@/lib/order-queries';
import { useCan } from '@/lib/session';

/** One company's next invoice: pick the orders (all by default); pending credits always go on it. */
export function CompanyBilling({ companyId }: { companyId: string }) {
  const billing = useCompanyBilling(companyId);
  const canWrite = useCan('BILLING_WRITE');
  const router = useRouter();
  const queryClient = useQueryClient();
  // Orders left out of the invoice; everything else is in.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const create = useMutation({
    mutationFn: (orderIds: string[]) =>
      api.post<InvoiceDetailDto>('/billing/invoices', { companyId, orderIds }),
    onSuccess: (invoice) => {
      void queryClient.invalidateQueries({ queryKey: billingKey });
      void queryClient.invalidateQueries({ queryKey: ordersQueryKey });
      toast.success(
        `${formatInvoiceNumber(invoice.number)} issued for ${formatCents(invoice.totalCents)}`,
      );
      router.push(`/billing/invoices/${invoice.id}`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not create the invoice.');
      void queryClient.invalidateQueries({ queryKey: billingKey });
    },
  });

  const back = (
    <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
      <Link href="/billing">
        <ArrowLeft /> Billing
      </Link>
    </Button>
  );
  if (billing.isPending) {
    return (
      <div className="space-y-4">
        {back}
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-80" />
      </div>
    );
  }
  if (billing.isError) {
    return (
      <div>
        {back}
        <p className="text-sm text-destructive">{billing.error.message}</p>
      </div>
    );
  }

  const { company, orders, pendingCredits, invoices } = billing.data;
  const chosen = orders.filter((o) => !excluded.has(o.id));
  const ordersTotal = chosen.reduce((sum, o) => sum + o.totalCents, 0);
  const creditsTotal = pendingCredits.reduce((sum, c) => sum + c.amountCents, 0);
  const toggle = (id: string) => {
    const next = new Set(excluded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExcluded(next);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        {back}
        <PageHeader
          title={company.name}
          description={`Bill to ${company.billingContactName} · ${company.billingEmail} · ${company.billingAddress}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-4">
            <CardTitle>Confirmed orders not yet invoiced</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {orders.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Nothing to invoice - every confirmed order is on an invoice.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        aria-label="Choose all orders"
                        checked={excluded.size === 0}
                        disabled={!canWrite}
                        onChange={() =>
                          setExcluded(
                            excluded.size === 0 ? new Set(orders.map((o) => o.id)) : new Set(),
                          )
                        }
                      />
                    </TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Delivery</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Meals</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          aria-label={`Invoice ${formatOrderNumber(order.number)}`}
                          checked={!excluded.has(order.id)}
                          disabled={!canWrite}
                          onChange={() => toggle(order.id)}
                        />
                      </TableCell>
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
                        {order.employeeName}{' '}
                        {order.status === 'DELIVERED' ? (
                          <OrderStatusBadge status="DELIVERED" className="ml-1" />
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{order.mealCount}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatCents(order.totalCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit gap-3 p-4 lg:sticky lg:top-20">
          <p className="font-semibold">Next invoice</p>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                {chosen.length} {chosen.length === 1 ? 'order' : 'orders'}
              </dt>
              <dd className="tabular-nums">{formatCents(ordersTotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                {pendingCredits.length} {pendingCredits.length === 1 ? 'credit' : 'credits'}
              </dt>
              <dd className="text-success tabular-nums">{formatCents(creditsTotal)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatCents(ordersTotal + creditsTotal)}</dd>
            </div>
          </dl>
          {canWrite ? (
            <Button
              disabled={create.isPending || (chosen.length === 0 && pendingCredits.length === 0)}
              onClick={() => create.mutate(chosen.map((o) => o.id))}
            >
              {create.isPending ? <Loader2 className="animate-spin" /> : <FileText />}
              Issue invoice
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">
            An issued invoice never changes. Orders cancelled or delivered short afterwards get a
            credit on the next one.
          </p>
        </Card>
      </div>

      {pendingCredits.length > 0 ? (
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-4">
            <CardTitle>Credits waiting for the next invoice</CardTitle>
          </CardHeader>
          <Table>
            <TableBody>
              {pendingCredits.map((credit) => (
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
                  <TableCell className="text-right font-medium text-success tabular-nums">
                    {formatCents(credit.amountCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}

      {invoices.length > 0 ? (
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-4">
            <CardTitle>Invoices</CardTitle>
          </CardHeader>
          <Table>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <Link
                      href={`/billing/invoices/${invoice.id}`}
                      className="font-mono text-sm font-semibold hover:underline"
                    >
                      {formatInvoiceNumber(invoice.number)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {invoice.orderCount} orders
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCents(invoice.totalCents)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={invoice.status === 'PAID' ? 'success' : 'warning'}>
                      {invoice.status === 'PAID' ? 'Paid' : 'Unpaid'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
