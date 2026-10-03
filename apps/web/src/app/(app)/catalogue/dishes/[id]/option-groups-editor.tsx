'use client';

import {
  dishOptionGroupsSchema,
  type DishDetailDto,
  type DishOptionGroupsInput,
  type ReferenceDataDto,
} from '@fernleaf/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2, X } from 'lucide-react';
import { Controller, useFieldArray, useForm, type FieldErrors } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FieldError } from '@/components/field-error';
import { ToggleChips } from '@/components/toggle-chips';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { dishesQueryKey, selectClassName, useOptions } from '@/lib/catalogue-queries';
import { applyServerErrors } from '@/lib/form-errors';
import { useCan } from '@/lib/session';
import { dishQueryKey } from './dish-editor';

type FormInput = z.input<typeof dishOptionGroupsSchema>;

function toFormValues(dish: DishDetailDto): FormInput {
  return {
    groups: dish.optionGroups.map((group) => ({
      id: group.id,
      name: group.name,
      isRequired: group.isRequired,
      maxSelections: group.maxSelections,
      usesPortions: group.usesPortions,
      portionSizeIds: group.portionSizes.map((size) => size.id),
      optionIds: group.options.map((option) => option.id),
    })),
  };
}

/**
 * The choices a dish asks for, e.g. "Choose your protein". Every combination ordered must
 * answer every required group; a portioned group sells its options in sizes.
 */
export function OptionGroupsEditor({
  dish,
  reference,
}: {
  dish: DishDetailDto;
  reference: ReferenceDataDto;
}) {
  const queryClient = useQueryClient();
  const canEdit = useCan('CATALOGUE_WRITE');
  const options = useOptions();
  const form = useForm<FormInput, unknown, DishOptionGroupsInput>({
    resolver: zodResolver(dishOptionGroupsSchema),
    defaultValues: toFormValues(dish),
  });
  const groups = useFieldArray({ control: form.control, name: 'groups', keyName: 'key' });
  const { errors, isDirty, isSubmitting } = form.formState;

  const save = useMutation({
    mutationFn: (input: DishOptionGroupsInput) =>
      api.put<DishDetailDto>(`/dishes/${dish.id}/option-groups`, input),
    onSuccess: (saved) => {
      queryClient.setQueryData(dishQueryKey(dish.id), saved);
      // New groups now have ids - take them from the server so the next save updates in place.
      form.reset(toFormValues(saved));
      void queryClient.invalidateQueries({ queryKey: dishesQueryKey });
      toast.success('Option groups saved');
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  const optionList = options.data ?? [];
  const optionName = (id: string) => optionList.find((o) => o.id === id)?.name ?? 'Unknown option';
  const groupErrors = errors.groups as FieldErrors<FormInput>['groups'];

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset disabled={!canEdit || isSubmitting}>
        <Card>
          <CardHeader>
            <CardTitle>Option groups</CardTitle>
            <CardDescription>
              Shown to employees in this order. Required groups must be answered in every
              combination; a group that sells in sizes needs every option to support those sizes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {groups.fields.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No option groups - this dish is ordered as it is.
              </p>
            ) : null}

            {groups.fields.map((group, index) => {
              const errorsHere = groupErrors?.[index];
              const usesPortions = form.watch(`groups.${index}.usesPortions`);
              return (
                <div key={group.key} className="space-y-4 rounded-lg border p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-56 flex-1 space-y-1">
                      <Label htmlFor={`group-${index}-name`}>Group name</Label>
                      <Input
                        id={`group-${index}-name`}
                        placeholder="e.g. Choose your protein"
                        aria-invalid={errorsHere?.name ? true : undefined}
                        {...form.register(`groups.${index}.name`)}
                      />
                      <FieldError message={errorsHere?.name?.message} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`group-${index}-max`}>Max picks</Label>
                      <Input
                        id={`group-${index}-max`}
                        type="number"
                        min={1}
                        className="w-24"
                        aria-invalid={errorsHere?.maxSelections ? true : undefined}
                        {...form.register(`groups.${index}.maxSelections`, { valueAsNumber: true })}
                      />
                      <FieldError message={errorsHere?.maxSelections?.message} />
                    </div>
                    <div className="flex items-center gap-1 pt-6">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Move up"
                        disabled={index === 0}
                        onClick={() => groups.move(index, index - 1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Move down"
                        disabled={index === groups.fields.length - 1}
                        onClick={() => groups.move(index, index + 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove group"
                        onClick={() => groups.remove(index)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-6">
                    <label className="flex items-center gap-2 text-sm">
                      <Controller
                        control={form.control}
                        name={`groups.${index}.isRequired`}
                        render={({ field }) => (
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={!canEdit}
                          />
                        )}
                      />
                      Required
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Controller
                        control={form.control}
                        name={`groups.${index}.usesPortions`}
                        render={({ field }) => (
                          <Switch
                            checked={field.value}
                            disabled={!canEdit}
                            onCheckedChange={(on) => {
                              field.onChange(on);
                              if (!on) form.setValue(`groups.${index}.portionSizeIds`, []);
                            }}
                          />
                        )}
                      />
                      Sold in sizes
                    </label>
                  </div>

                  {usesPortions ? (
                    <div className="space-y-1">
                      <Label>Sizes this group sells</Label>
                      <Controller
                        control={form.control}
                        name={`groups.${index}.portionSizeIds`}
                        render={({ field }) => (
                          <ToggleChips
                            items={reference['portion-sizes']}
                            value={field.value ?? []}
                            onChange={field.onChange}
                            disabled={!canEdit}
                            emptyText="Add portion sizes under Reference lists first."
                          />
                        )}
                      />
                      <FieldError message={errorsHere?.portionSizeIds?.message} />
                    </div>
                  ) : null}

                  <Controller
                    control={form.control}
                    name={`groups.${index}.optionIds`}
                    render={({ field }) => {
                      const ids = field.value ?? [];
                      const available = optionList.filter((o) => o.isActive && !ids.includes(o.id));
                      return (
                        <div className="space-y-2">
                          <Label>Options, in order</Label>
                          {ids.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No options yet.</p>
                          ) : null}
                          <ul className="space-y-1">
                            {ids.map((optionId, position) => {
                              const option = optionList.find((o) => o.id === optionId);
                              const optionError = errorsHere?.optionIds?.[position]?.message;
                              return (
                                <li key={optionId}>
                                  <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm">
                                    <span className="flex-1">{optionName(optionId)}</span>
                                    {option && !option.isActive ? (
                                      <Badge variant="secondary">Off</Badge>
                                    ) : null}
                                    {option && option.portions.length > 0 ? (
                                      <span className="text-xs text-muted-foreground">
                                        {option.portions.map((p) => p.portionSizeName).join(' / ')}
                                      </span>
                                    ) : null}
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="size-7"
                                      aria-label="Move option up"
                                      disabled={position === 0}
                                      onClick={() =>
                                        field.onChange(swap(ids, position, position - 1))
                                      }
                                    >
                                      <ArrowUp className="size-3.5" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="size-7"
                                      aria-label="Move option down"
                                      disabled={position === ids.length - 1}
                                      onClick={() =>
                                        field.onChange(swap(ids, position, position + 1))
                                      }
                                    >
                                      <ArrowDown className="size-3.5" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="size-7"
                                      aria-label={`Remove ${optionName(optionId)}`}
                                      onClick={() =>
                                        field.onChange(ids.filter((id) => id !== optionId))
                                      }
                                    >
                                      <X className="size-3.5" />
                                    </Button>
                                  </div>
                                  <FieldError message={optionError} />
                                </li>
                              );
                            })}
                          </ul>
                          {canEdit && available.length > 0 ? (
                            <select
                              className={`${selectClassName} max-w-xs`}
                              value=""
                              aria-label="Add an option"
                              onChange={(event) =>
                                event.target.value && field.onChange([...ids, event.target.value])
                              }
                            >
                              <option value="">+ Add an option…</option>
                              {available.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.name}
                                  {option.portions.length > 0
                                    ? ` (${option.portions.map((p) => p.portionSizeName).join('/')})`
                                    : ''}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          <FieldError
                            message={
                              errorsHere?.optionIds?.message ?? errorsHere?.optionIds?.root?.message
                            }
                          />
                        </div>
                      );
                    }}
                  />
                  <FieldError message={errorsHere?.message} />
                </div>
              );
            })}

            <FieldError message={errors.groups?.message ?? errors.groups?.root?.message} />
            <FieldError message={errors.root?.server?.message} />

            {canEdit ? (
              <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    groups.append({
                      name: '',
                      isRequired: true,
                      maxSelections: 1,
                      usesPortions: false,
                      portionSizeIds: [],
                      optionIds: [],
                    })
                  }
                >
                  <Plus /> Add group
                </Button>
                <Button type="submit" disabled={!isDirty || isSubmitting}>
                  {isSubmitting ? <Loader2 className="animate-spin" /> : null}
                  Save option groups
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </fieldset>
    </form>
  );
}

function swap<T>(items: T[], from: number, to: number): T[] {
  const copy = [...items];
  [copy[from], copy[to]] = [copy[to] as T, copy[from] as T];
  return copy;
}
