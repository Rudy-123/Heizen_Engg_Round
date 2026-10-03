'use client';

import type { DishDetailDto } from '@fernleaf/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useReferenceData } from '@/lib/catalogue-queries';
import { DishDetailsForm } from './dish-details-form';
import { OptionGroupsEditor } from './option-groups-editor';

export const dishQueryKey = (id: string) => ['dishes', 'detail', id] as const;

export function DishEditor({ id }: { id: string }) {
  const isNew = id === 'new';
  const reference = useReferenceData();
  const dish = useQuery({
    queryKey: dishQueryKey(id),
    queryFn: () => api.get<DishDetailDto>(`/dishes/${id}`),
    enabled: !isNew,
  });

  const back = (
    <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
      <Link href="/catalogue?tab=dishes">
        <ArrowLeft /> All dishes
      </Link>
    </Button>
  );

  if (reference.isPending || (!isNew && dish.isPending)) {
    return (
      <div className="space-y-4">
        {back}
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (reference.isError || dish.isError) {
    return (
      <div>
        {back}
        <p className="text-sm text-destructive">{(reference.error ?? dish.error)?.message}</p>
      </div>
    );
  }

  const data = isNew ? null : (dish.data ?? null);
  return (
    <div className="mx-auto max-w-4xl">
      {back}
      <PageHeader
        title={data ? data.name : 'New dish'}
        description={
          data
            ? `SKU ${data.sku} · ${data.kitchenStation?.name ?? 'No station (prep goes to “Unassigned”)'}`
            : 'Create the dish first; then add its option groups.'
        }
        actions={
          data ? (
            data.isActive ? (
              <Badge variant="success">Active</Badge>
            ) : (
              <Badge variant="secondary">Switched off</Badge>
            )
          ) : null
        }
      />
      <div className="space-y-6">
        <DishDetailsForm key={data?.updatedAt ?? 'new'} dish={data} reference={reference.data} />
        {data ? (
          <OptionGroupsEditor key={data.updatedAt} dish={data} reference={reference.data} />
        ) : null}
      </div>
    </div>
  );
}
