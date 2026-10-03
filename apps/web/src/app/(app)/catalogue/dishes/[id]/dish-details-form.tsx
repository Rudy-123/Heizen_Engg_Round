'use client';

import {
  dishInputSchema,
  TEMPERATURES,
  type DishDetailDto,
  type DishInput,
  type ReferenceDataDto,
} from '@fernleaf/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Flame, Loader2, Snowflake } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FieldError } from '@/components/field-error';
import { MoneyInput } from '@/components/money-input';
import { ToggleChips } from '@/components/toggle-chips';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { dishesQueryKey, selectClassName } from '@/lib/catalogue-queries';
import { applyServerErrors } from '@/lib/form-errors';
import { useCan } from '@/lib/session';
import { cn } from '@/lib/utils';

type FormInput = z.input<typeof dishInputSchema>;

function toFormValues(dish: DishDetailDto | null): FormInput {
  return {
    sku: dish?.sku ?? '',
    name: dish?.name ?? '',
    description: dish?.description ?? '',
    imageUrl: dish?.imageUrl ?? '',
    temperature: dish?.temperature ?? 'HOT',
    costCents: dish?.costCents ?? Number.NaN,
    kitchenStationId: dish?.kitchenStation?.id ?? null,
    minOrderQuantity: dish?.minOrderQuantity ?? null,
    allergenIds: dish?.allergenIds ?? [],
    dietaryTagIds: dish?.dietaryTagIds ?? [],
    isActive: dish?.isActive ?? true,
  };
}

export function DishDetailsForm({
  dish,
  reference,
}: {
  dish: DishDetailDto | null;
  reference: ReferenceDataDto;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canEdit = useCan('CATALOGUE_WRITE');
  const canSeeCost = useCan('PRICING_READ');
  const form = useForm<FormInput, unknown, DishInput>({
    resolver: zodResolver(dishInputSchema),
    defaultValues: toFormValues(dish),
  });
  const { errors, isDirty, isSubmitting } = form.formState;
  const imageUrl = form.watch('imageUrl');

  const save = useMutation({
    mutationFn: (input: DishInput) =>
      dish
        ? api.put<DishDetailDto>(`/dishes/${dish.id}`, input)
        : api.post<DishDetailDto>('/dishes', input),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: dishesQueryKey });
      if (dish) {
        toast.success('Dish saved');
      } else {
        toast.success(`${saved.name} created - now add its option groups`);
        router.replace(`/catalogue/dishes/${saved.id}`);
      }
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset disabled={!canEdit || isSubmitting}>
        <Card>
          <CardHeader>
            <CardTitle>Dish details</CardTitle>
            <CardDescription>
              Prices are set per price tier on the Pricing page. Past orders keep the names and
              prices they were sold with, whatever you change here.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dish-name">Name</Label>
              <Input
                id="dish-name"
                aria-invalid={errors.name ? true : undefined}
                {...form.register('name')}
              />
              <FieldError message={errors.name?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dish-sku">SKU</Label>
              <Input
                id="dish-sku"
                className="font-mono uppercase"
                aria-invalid={errors.sku ? true : undefined}
                {...form.register('sku')}
              />
              <FieldError message={errors.sku?.message} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="dish-description">Description</Label>
              <Textarea id="dish-description" rows={2} {...form.register('description')} />
              <FieldError message={errors.description?.message} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="dish-image">Image URL</Label>
              <div className="flex items-start gap-3">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt=""
                    className="size-16 shrink-0 rounded-lg border object-cover"
                  />
                ) : null}
                <div className="flex-1 space-y-2">
                  <Input
                    id="dish-image"
                    placeholder="https://…"
                    aria-invalid={errors.imageUrl ? true : undefined}
                    {...form.register('imageUrl')}
                  />
                  <FieldError message={errors.imageUrl?.message} />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Temperature</Label>
              <Controller
                control={form.control}
                name="temperature"
                render={({ field }) => (
                  <div className="flex gap-2" role="group" aria-label="Temperature">
                    {TEMPERATURES.map((temperature) => (
                      <button
                        key={temperature}
                        type="button"
                        aria-pressed={field.value === temperature}
                        onClick={() => field.onChange(temperature)}
                        className={cn(
                          'inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors disabled:opacity-50',
                          field.value === temperature
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'bg-card text-muted-foreground hover:bg-accent',
                        )}
                      >
                        {temperature === 'HOT' ? (
                          <Flame className="size-4" />
                        ) : (
                          <Snowflake className="size-4" />
                        )}
                        {temperature === 'HOT' ? 'Hot' : 'Cold'}
                      </button>
                    ))}
                  </div>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dish-station">Kitchen station</Label>
              <Controller
                control={form.control}
                name="kitchenStationId"
                render={({ field }) => (
                  <select
                    id="dish-station"
                    className={selectClassName}
                    value={field.value ?? ''}
                    onChange={(event) => field.onChange(event.target.value || null)}
                  >
                    <option value="">None (“Unassigned” on the kitchen board)</option>
                    {reference['kitchen-stations']
                      .filter((s) => s.isActive || s.id === field.value)
                      .map((station) => (
                        <option key={station.id} value={station.id}>
                          {station.name}
                        </option>
                      ))}
                  </select>
                )}
              />
              <FieldError message={errors.kitchenStationId?.message} />
            </div>

            {canSeeCost || !dish ? (
              <div className="space-y-2">
                <Label htmlFor="dish-cost">Cost to make</Label>
                <Controller
                  control={form.control}
                  name="costCents"
                  render={({ field }) => (
                    <MoneyInput
                      id="dish-cost"
                      className="w-40"
                      value={field.value}
                      onChange={field.onChange}
                      invalid={!!errors.costCents}
                    />
                  )}
                />
                <p className="text-xs text-muted-foreground">Used by “cost × N” price tiers.</p>
                <FieldError message={errors.costCents?.message} />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="dish-moq">Minimum order quantity</Label>
              <Controller
                control={form.control}
                name="minOrderQuantity"
                render={({ field }) => (
                  <Input
                    id="dish-moq"
                    type="number"
                    min={1}
                    className="w-40"
                    placeholder="No minimum"
                    value={field.value ?? ''}
                    onChange={(event) =>
                      field.onChange(event.target.value === '' ? null : Number(event.target.value))
                    }
                    aria-invalid={errors.minOrderQuantity ? true : undefined}
                  />
                )}
              />
              <FieldError message={errors.minOrderQuantity?.message} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Allergens</Label>
              <Controller
                control={form.control}
                name="allergenIds"
                render={({ field }) => (
                  <ToggleChips
                    items={reference.allergens}
                    value={field.value ?? []}
                    onChange={field.onChange}
                    disabled={!canEdit}
                  />
                )}
              />
              <FieldError message={errors.allergenIds?.message} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Dietary tags</Label>
              <Controller
                control={form.control}
                name="dietaryTagIds"
                render={({ field }) => (
                  <ToggleChips
                    items={reference['dietary-tags']}
                    value={field.value ?? []}
                    onChange={field.onChange}
                    disabled={!canEdit}
                  />
                )}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
              <div>
                <Label htmlFor="dish-active">Available</Label>
                <p className="text-xs text-muted-foreground">
                  Switched-off dishes vanish from every menu but stay on past orders. Dishes are
                  never deleted.
                </p>
              </div>
              <Controller
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <Switch
                    id="dish-active"
                    checked={field.value ?? true}
                    onCheckedChange={field.onChange}
                    disabled={!canEdit}
                  />
                )}
              />
            </div>

            <div className="md:col-span-2">
              <FieldError message={errors.root?.server?.message} />
            </div>
          </CardContent>
          {canEdit ? (
            <div className="flex justify-end gap-2 border-t px-5 pt-4">
              <Button type="submit" disabled={isSubmitting || (!!dish && !isDirty)}>
                {isSubmitting ? <Loader2 className="animate-spin" /> : null}
                {dish ? 'Save details' : 'Create dish'}
              </Button>
            </div>
          ) : null}
        </Card>
      </fieldset>
    </form>
  );
}
