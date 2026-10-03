'use client';

import {
  createKitchenHolidaySchema,
  type CreateKitchenHolidayInput,
  type KitchenHolidayDto,
} from '@fernleaf/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FieldError } from '@/components/field-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { formatIsoDate } from '@/lib/format';
import { applyServerErrors } from '@/lib/form-errors';
import { cutoffPreviewQueryKey } from './cutoff-preview-card';

export function KitchenHolidaysCard({
  holidays,
  canEdit,
}: {
  holidays: KitchenHolidayDto[];
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['settings'] });
    void queryClient.invalidateQueries({ queryKey: cutoffPreviewQueryKey });
  };

  const form = useForm<CreateKitchenHolidayInput>({
    resolver: zodResolver(createKitchenHolidaySchema),
    defaultValues: { date: '', name: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const add = useMutation({
    mutationFn: (input: CreateKitchenHolidayInput) =>
      api.post<KitchenHolidayDto>('/settings/kitchen-holidays', input),
    onSuccess: (holiday) => {
      form.reset();
      refresh();
      toast.success(`Kitchen closed on ${formatIsoDate(holiday.date)}`);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/settings/kitchen-holidays/${id}`),
    onSuccess: refresh,
    onError: (error) => toast.error(error.message),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await add.mutateAsync(values);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kitchen holidays</CardTitle>
        <CardDescription>
          Days the kitchen is closed: no deliveries, and skipped when counting back to a cut-off.
          (Company holidays are set per company and never move cut-offs.)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {holidays.length === 0 ? (
          <p className="text-sm text-muted-foreground">No kitchen holidays.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {holidays.map((holiday) => (
              <li key={holiday.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-28 shrink-0 font-medium">
                  {formatIsoDate(holiday.date, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
                <span className="flex-1 truncate text-muted-foreground">{holiday.name}</span>
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${holiday.name}`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(holiday.id)}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canEdit ? (
          <form onSubmit={onSubmit} noValidate className="space-y-2">
            <div className="flex gap-2">
              <Input
                type="date"
                className="w-40"
                aria-label="Holiday date"
                aria-invalid={errors.date ? true : undefined}
                {...form.register('date')}
              />
              <Input
                placeholder="Name, e.g. Diwali"
                aria-label="Holiday name"
                aria-invalid={errors.name ? true : undefined}
                {...form.register('name')}
              />
              <Button type="submit" variant="outline" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin" /> : <Plus />}
                Add
              </Button>
            </div>
            <FieldError message={errors.date?.message} />
            <FieldError message={errors.name?.message} />
            <FieldError message={errors.root?.server?.message} />
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
