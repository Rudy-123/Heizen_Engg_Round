'use client';

import { formatCents, formatInvoiceNumber } from '@fernleaf/shared';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
import { useBillingOverview, useInvoices } from '@/lib/billing-queries';
import { formatInstant, formatIsoDate } from '@/lib/format';
import { useKitchenTimeZone } from '@/lib/kitchen-clock';
import { cn } from '@/lib/utils';

/**
 * Spec 4.9: what each company owes. "To invoice" = confirmed and delivered orders that are on
 * no invoice yet; credits wait for the company's next invoice; unpaid = issued, not paid.
 */
export function BillingView() {
  const overview = useBillingOverview();
  const router = useRouter();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="Every confirmed order is owed in full by its company. Group them into invoices and mark invoices paid. Totals are pre-tax, no fees."
      />

      {overview.isPending ? (
        <Skeleton className="h-72" />
      ) : overview.isError ? (
        <p className="text-sm text-destructive">{overview.error.message}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Total
              label="To invoice"
              value={overview.data.totals.uninvoicedCents}
              note="Confirmed orders on no invoice yet"
            />
            <Total
              label="Credits waiting"
              value={overview.data.totals.pendingCreditsCents}
              note="Go on each company’s next invoice"
            />
            <Total
              label="Unpaid invoices"
              value={overview.data.totals.unpaidCents}
              note="Issued and not marked paid"
            />
          </div>
          <Card className="gap-0 py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead className="text-right">Orders to invoice</TableHead>
                  <TableHead className="text-right">To invoice</TableHead>
                  <TableHead className="text-right">Credits waiting</TableHead>
                  <TableHead>Oldest delivery</TableHead>
                  <TableHead className="text-right">Unpaid</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.data.companies.map((row) => (
                  <TableRow
                    key={row.company.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/billing/companies/${row.company.id}`)}
                  >
                    <TableCell className="font-medium">{row.company.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.uninvoicedOrders || '-'}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {row.uninvoicedCents ? formatCents(row.uninvoicedCents) : '-'}
                    </TableCell>
                    <TableCell className="text-right text-success tabular-nums">
                      {row.pendingCreditsCents ? formatCents(row.pendingCreditsCents) : '-'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {row.oldestUninvoicedDate ? formatIsoDate(row.oldestUninvoicedDate) : '-'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.unpaidInvoices > 0 ? (
                        <span>
                          {formatCents(row.unpaidCents)}{' '}
                          <span className="text-xs text-muted-foreground">
                            ({row.unpaidInvoices})
                          </span>
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <ArrowRight className="ml-auto size-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <InvoiceList />
    </div>
  );
}

function Total({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <Card className="gap-1 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-display text-3xl font-semibold tabular-nums">{formatCents(value)}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </Card>
  );
}

function InvoiceList() {
  const [status, setStatus] = useState<'ISSUED' | 'PAID' | 'all'>('all');
  const [page, setPage] = useState(1);
  const invoices = useInvoices({ status, page });
  const zone = useKitchenTimeZone() ?? 'Asia/Kolkata';
  const data = invoices.data;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b py-4">
        <CardTitle>Invoices</CardTitle>
        <div className="flex gap-1.5">
          {(['all', 'ISSUED', 'PAID'] as const).map((option) => (
            <Button
              key={option}
              size="sm"
              variant={status === option ? 'default' : 'outline'}
              onClick={() => {
                setStatus(option);
                setPage(1);
              }}
            >
              {option === 'all' ? 'All' : option === 'ISSUED' ? 'Unpaid' : 'Paid'}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {invoices.isPending ? (
          <Skeleton className="m-4 h-24" />
        ) : invoices.isError ? (
          <p className="p-4 text-sm text-destructive">{invoices.error.message}</p>
        ) : data && data.items.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No invoices yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Deliveries</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <Link
                      href={`/billing/invoices/${invoice.id}`}
                      className="font-mono text-sm font-semibold hover:underline"
                    >
                      {formatInvoiceNumber(invoice.number)}
                    </Link>
                  </TableCell>
                  <TableCell>{invoice.company.name}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {invoice.periodStart && invoice.periodEnd
                      ? invoice.periodStart === invoice.periodEnd
                        ? formatIsoDate(invoice.periodStart)
                        : `${formatIsoDate(invoice.periodStart)} – ${formatIsoDate(invoice.periodEnd)}`
                      : 'Credits only'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatInstant(invoice.issuedAt, zone, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-medium tabular-nums',
                      invoice.totalCents < 0 && 'text-success',
                    )}
                  >
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
        )}
        {data && data.total > data.pageSize ? (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              Page {data.page} of {Math.ceil(data.total / data.pageSize)}
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
                disabled={page * data.pageSize >= data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
