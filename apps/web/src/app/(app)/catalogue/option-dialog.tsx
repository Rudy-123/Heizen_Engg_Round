'use client';

import {
  optionInputSchema,
  type OptionDto,
  type OptionInput,
  type ReferenceDataDto,
} from '@fernleaf/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FieldError } from '@/components/field-error';
import { MoneyInput } from '@/components/money-input';
import { ToggleChips } from '@/components/toggle-chips';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { optionsQueryKey, selectClassName } from '@/lib/catalogue-queries';
import { applyServerErrors } from '@/lib/form-errors';

type FormInput = z.input<typeof optionInputSchema>;

function toFormValues(option: OptionDto | null): FormInput {
  if (!option) {
    return {
      name: '',
      description: '',
      costCents: Number.NaN,
      allergenIds: [],
      dietaryTagIds: [],
      portions: [],
      isActive: true,
    };
  }
  return {
    name: option.name,
    description: option.description,
    costCents: option.costCents ?? Number.NaN,
    allergenIds: option.allergenIds,
    dietaryTagIds: option.dietaryTagIds,
    portions: option.portions.map((p) => ({
      portionSizeId: p.portionSizeId,
      extraChargeCents: p.extraChargeCents,
    })),
    isActive: option.isActive,
  };
}

/** Create or edit a reusable option, including the sizes it is sold in. */
export function OptionDialog({
  option,
  reference,
  onClose,
}: {
  option: OptionDto | null;
  reference: ReferenceDataDto;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<FormInput, unknown, OptionInput>({
    resolver: zodResolver(optionInputSchema),
    defaultValues: toFormValues(option),
  });
  const portions = useFieldArray({ control: form.control, name: 'portions' });
  const { errors, isSubmitting } = form.formState;
  const sizes = reference['portion-sizes'];

  const save = useMutation({
    mutationFn: (input: OptionInput) =>
      option
        ? api.put<OptionDto>(`/options/${option.id}`, input)
        : api.post<OptionDto>('/options', input),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: optionsQueryKey });
      toast.success(option ? `Saved ${saved.name}` : `Added ${saved.name}`);
      onClose();
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  const unusedSize = sizes.find(
    (size) => size.isActive && !form.watch('portions')?.some((p) => p.portionSizeId === size.id),
  );

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{option ? `Edit ${option.name}` : 'New option'}</DialogTitle>
          <DialogDescription>
            An option’s price is set per price tier on the Pricing page; its cost is used for
            cost-based tiers.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <div className="space-y-2">
              <Label htmlFor="option-name">Name</Label>
              <Input
                id="option-name"
                aria-invalid={errors.name ? true : undefined}
                {...form.register('name')}
              />
              <FieldError message={errors.name?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="option-cost">Cost to make</Label>
              <Controller
                control={form.control}
                name="costCents"
                render={({ field }) => (
                  <MoneyInput
                    id="option-cost"
                    value={field.value}
                    onChange={field.onChange}
                    invalid={!!errors.costCents}
                  />
                )}
              />
              <FieldError message={errors.costCents?.message} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="option-description">Description (optional)</Label>
            <Input id="option-description" {...form.register('description')} />
          </div>

          <div className="space-y-2">
            <Label>Allergens</Label>
            <Controller
              control={form.control}
              name="allergenIds"
              render={({ field }) => (
                <ToggleChips
                  items={reference.allergens}
                  value={field.value ?? []}
                  onChange={field.onChange}
                />
              )}
            />
            <FieldError message={errors.allergenIds?.message} />
          </div>

          <div className="space-y-2">
            <Label>Dietary tags</Label>
            <Controller
              control={form.control}
              name="dietaryTagIds"
              render={({ field }) => (
                <ToggleChips
                  items={reference['dietary-tags']}
                  value={field.value ?? []}
                  onChange={field.onChange}
                />
              )}
            />
          </div>

          <div className="space-y-2">
            <Label>Sizes it is sold in</Label>
            <p className="text-xs text-muted-foreground">
              Only needed if a dish sells this option in sizes. The extra charge is added on top of
              the option’s price.
            </p>
            {portions.fields.map((field, index) => (
              <div key={field.id} className="flex items-center gap-2">
                <select
                  className={`${selectClassName} flex-1`}
                  aria-label="Size"
                  {...form.register(`portions.${index}.portionSizeId`)}
                >
                  {sizes.map((size) => (
                    <option key={size.id} value={size.id}>
                      {size.name}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-muted-foreground">+</span>
                <Controller
                  control={form.control}
                  name={`portions.${index}.extraChargeCents`}
                  render={({ field: money }) => (
                    <MoneyInput
                      className="w-32"
                      aria-label="Extra charge"
                      value={money.value}
                      onChange={money.onChange}
                      invalid={!!errors.portions?.[index]?.extraChargeCents}
                    />
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove size"
                  onClick={() => portions.remove(index)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            {unusedSize ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  portions.append({ portionSizeId: unusedSize.id, extraChargeCents: 0 })
                }
              >
                <Plus /> Add size
              </Button>
            ) : null}
            <FieldError message={errors.portions?.message ?? errors.portions?.root?.message} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="option-active">Available</Label>
              <p className="text-xs text-muted-foreground">
                Switched-off options disappear from menus but stay on past orders.
              </p>
            </div>
            <Controller
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <Switch
                  id="option-active"
                  checked={field.value ?? true}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </div>

          <FieldError message={errors.root?.server?.message} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              {option ? 'Save option' : 'Add option'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
