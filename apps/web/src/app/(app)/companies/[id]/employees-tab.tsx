'use client';

import type { CompanyDetailDto, EmployeeDto } from '@fernleaf/shared';
import { Clock, Crown, MapPin, Package, Plus, Search, TriangleAlert } from 'lucide-react';
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
import { selectClassName, useReferenceData } from '@/lib/catalogue-queries';
import { useEmployees } from '@/lib/company-queries';
import { useCan } from '@/lib/session';
import { cn } from '@/lib/utils';
import { EmployeeDialog } from '../employee-dialog';

const PAGE_SIZE = 20;

export function EmployeesTab({ company }: { company: CompanyDetailDto }) {
  const canEdit = useCan('EMPLOYEES_WRITE');
  const reference = useReferenceData();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<EmployeeDto | 'new' | null>(null);
  const deferredSearch = useDeferredValue(search.trim());
  const employees = useEmployees({
    companyId: company.id,
    search: deferredSearch,
    status,
    page,
    pageSize: PAGE_SIZE,
  });
  const allergenName = (id: string) =>
    reference.data?.allergens.find((allergen) => allergen.id === id)?.name ?? '?';

  const data = employees.data;
  const from = data ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center gap-3 border-b p-4">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name or email"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className={cn(selectClassName, 'w-36')}
          value={status}
          aria-label="Show"
          onChange={(event) => {
            setStatus(event.target.value as typeof status);
            setPage(1);
          }}
        >
          <option value="active">Active</option>
          <option value="inactive">Switched off</option>
          <option value="all">Everyone</option>
        </select>
        {canEdit ? (
          <Button onClick={() => setEditing('new')}>
            <Plus /> Add employee
          </Button>
        ) : null}
      </div>

      {employees.isPending ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : employees.isError ? (
        <p className="p-4 text-sm text-destructive">{employees.error.message}</p>
      ) : data && data.items.length === 0 ? (
        <p className="p-10 text-center text-sm text-muted-foreground">No employees match.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>May change</TableHead>
              <TableHead>Allergies</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.items ?? []).map((employee) => (
              <TableRow
                key={employee.id}
                className={cn(canEdit && 'cursor-pointer')}
                onClick={() => (canEdit ? setEditing(employee) : undefined)}
              >
                <TableCell>
                  <p className="flex items-center gap-2 font-medium">
                    {employee.firstName} {employee.lastName}
                    {employee.isOwner ? (
                      <Badge variant="outline">
                        <Crown /> Owner
                      </Badge>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">{employee.email}</p>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1.5 text-muted-foreground">
                    <Flag on={employee.canChooseAddress} icon={MapPin} label="Address" />
                    <Flag on={employee.canChangeDeliveryTime} icon={Clock} label="Delivery time" />
                    <Flag on={employee.canChangePackaging} icon={Package} label="Packaging" />
                  </div>
                </TableCell>
                <TableCell>
                  {employee.allergenIds.length === 0 ? (
                    <span className="text-muted-foreground">-</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-sm text-destructive">
                      <TriangleAlert className="size-3.5" />
                      {employee.allergenIds.map(allergenName).join(', ')}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {employee.isActive ? (
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

      {data && data.total > 0 ? (
        <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm">
          <span className="text-muted-foreground tabular-nums">
            {from}–{to} of {data.total}
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
              disabled={to >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      {editing ? (
        <EmployeeDialog
          employee={editing === 'new' ? null : editing}
          companyId={company.id}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Card>
  );
}

function Flag({ on, icon: Icon, label }: { on: boolean; icon: typeof MapPin; label: string }) {
  return (
    <span
      title={`${label}: ${on ? 'yes' : 'no'}`}
      aria-label={`${label}: ${on ? 'yes' : 'no'}`}
      className={cn(
        'flex size-7 items-center justify-center rounded-lg',
        on ? 'bg-accent text-accent-foreground' : 'opacity-30',
      )}
    >
      <Icon className="size-3.5" />
    </span>
  );
}
