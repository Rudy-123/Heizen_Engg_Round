'use client';

import { WEEKDAYS } from '@fernleaf/shared';
import { Building2, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useState } from 'react';
import { PageHeader } from '@/components/page-header';
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
import { selectClassName } from '@/lib/catalogue-queries';
import { useCompanies } from '@/lib/company-queries';
import { useCan } from '@/lib/session';
import { cn } from '@/lib/utils';
import { NewCompanyDialog } from './new-company-dialog';

/** "Mon–Fri", "Mon–Sat", "Every day", or a list. */
export function describeWorkingDays(days: number[]): string {
  if (days.length === 7) return 'Every day';
  const isRun = days.every((day, i) => i === 0 || day === (days[i - 1] ?? 0) + 1);
  const short = (iso: number) => WEEKDAYS.find((d) => d.iso === iso)?.short ?? '?';
  if (isRun && days.length > 2) return `${short(days[0] ?? 1)}–${short(days.at(-1) ?? 7)}`;
  return days.map(short).join(', ');
}

export function CompaniesView() {
  const router = useRouter();
  const canEdit = useCan('COMPANIES_WRITE');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('all');
  const [creating, setCreating] = useState(false);
  const companies = useCompanies(useDeferredValue(search.trim()), status);

  return (
    <div>
      <PageHeader
        title="Companies"
        description="The companies Fernleaf feeds: their email domains, delivery addresses, calendar, delivery defaults, price tier and employees."
        actions={
          canEdit ? (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New company
            </Button>
          ) : null
        }
      />

      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name or email domain"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <select
            className={cn(selectClassName, 'w-40')}
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
            aria-label="Show"
          >
            <option value="all">All companies</option>
            <option value="active">Active</option>
            <option value="inactive">Switched off</option>
          </select>
        </div>

        {companies.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : companies.isError ? (
          <p className="p-4 text-sm text-destructive">{companies.error.message}</p>
        ) : companies.data.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">No companies match.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Price tier</TableHead>
                <TableHead>Deliveries</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Employees</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.data.map((company) => (
                <TableRow
                  key={company.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/companies/${company.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                        <Building2 className="size-4" />
                      </span>
                      <div>
                        <Link
                          href={`/companies/${company.id}`}
                          className="font-medium hover:underline"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {company.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {company.domains.join(' · ')}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {company.priceTier ? (
                      company.priceTier.name
                    ) : (
                      <span className="text-muted-foreground">Default tier</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {describeWorkingDays(company.workingDays)}
                  </TableCell>
                  <TableCell>
                    {company.owner ? (
                      company.owner.name
                    ) : (
                      <span className="text-muted-foreground">Not set</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{company.employeeCount}</TableCell>
                  <TableCell className="text-right">
                    {company.isActive ? (
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

      {creating ? <NewCompanyDialog onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
