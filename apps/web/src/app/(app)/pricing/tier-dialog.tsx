'use client';

import {
  deriveCents,
  formatCents,
  priceTierInputSchema,
  type PriceRuleBasis,
  type PriceTierDto,
  type PriceTierInput,
} from '@fernleaf/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FieldError } from '@/components/field-error';
import { MultiplierInput } from '@/components/multiplier-input';
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
import { api } from '@/lib/api';
import { selectClassName } from '@/lib/catalogue-queries';
import { applyServerErrors } from '@/lib/form-errors';
import { pricingQueryKey } from '@/lib/pricing-queries';
import { cn } from '@/lib/utils';

type FormInput = z.input<typeof priceTierInputSchema>;

const RULES: { basis: PriceRuleBasis; title: string; text: string }[] = [
  { basis: 'NONE', title: 'Typed in', text: 'Every price is entered by hand.' },
  { basis: 'COST', title: 'From cost', text: 'Cost to make × a multiplier.' },
  { basis: 'TIER', title: 'From another tier', text: 'That tier’s price × a multiplier.' },
];

function toFormValues(tier: PriceTierDto | null): FormInput {
  return {
    name: tier?.name ?? '',
    description: tier?.description ?? '',
    ruleBasis: tier?.ruleBasis ?? 'NONE',
    baseTierId: tier?.baseTier?.id ?? null,
    multiplierBps: tier?.multiplierBps ?? null,
  };
}

/** Create a tier, or change its name and pricing rule. */
export function TierDialog({
  tier,
  allTiers,
  onClose,
}: {
  tier: PriceTierDto | null;
  allTiers: PriceTierDto[];
  onClose: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<FormInput, unknown, PriceTierInput>({
    resolver: zodResolver(priceTierInputSchema),
    defaultValues: toFormValues(tier),
  });
  const { errors, isSubmitting } = form.formState;
  const basis = form.watch('ruleBasis');
  const multiplier = form.watch('multiplierBps');
  const baseTierId = form.watch('baseTierId');
  const baseTiers = allTiers.filter((candidate) => candidate.id !== tier?.id);
  const baseName = baseTiers.find((candidate) => candidate.id === baseTierId)?.name;

  const save = useMutation({
    mutationFn: (input: PriceTierInput) =>
      tier
        ? api.put<PriceTierDto>(`/pricing/tiers/${tier.id}`, input)
        : api.post<PriceTierDto>('/pricing/tiers', input),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: pricingQueryKey });
      toast.success(tier ? `Saved ${saved.name}` : `Created ${saved.name}`);
      onClose();
      // A new tier starts empty: go straight to its grid to fill it in.
      if (!tier) router.push(`/pricing/tiers/${saved.id}`);
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  // A worked example under the multiplier, so the rule is easy to check before saving.
  let example: string | null = null;
  if (typeof multiplier === 'number' && Number.isFinite(multiplier) && multiplier > 0) {
    example =
      basis === 'COST'
        ? `Example: a dish that costs ${formatCents(350)} to make sells for ${formatCents(deriveCents(350, multiplier))}.`
        : `Example: ${formatCents(1_090)} on ${baseName ?? 'the base tier'} becomes ${formatCents(deriveCents(1_090, multiplier))} here.`;
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{tier ? `Edit ${tier.name}` : 'New price tier'}</DialogTitle>
          <DialogDescription>
            Prices typed in on a tier always win. A rule fills in every price nobody typed, rounded
            up to the next 5 cents.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="tier-name">Name</Label>
            <Input
              id="tier-name"
              placeholder="e.g. Enterprise"
              aria-invalid={errors.name ? true : undefined}
              {...form.register('name')}
            />
            <FieldError message={errors.name?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tier-description">Description (optional)</Label>
            <Input
              id="tier-description"
              placeholder="Who this tier is for"
              {...form.register('description')}
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Prices nobody typed come from</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {RULES.map((rule) => (
                <label
                  key={rule.basis}
                  className={cn(
                    'cursor-pointer rounded-lg border p-3 text-sm transition-colors hover:bg-accent/60',
                    basis === rule.basis && 'border-primary bg-primary/5 ring-1 ring-primary',
                  )}
                >
                  <input
                    type="radio"
                    value={rule.basis}
                    className="sr-only"
                    {...form.register('ruleBasis', {
                      onChange: () => {
                        // Values of the other rules are dropped by the schema anyway; clearing
                        // them here stops a hidden, half-typed multiplier from blocking the save.
                        if (form.getValues('ruleBasis') === 'NONE') {
                          form.setValue('multiplierBps', null);
                        }
                      },
                    })}
                  />
                  <span className="block font-medium">{rule.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{rule.text}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {basis === 'TIER' ? (
            <div className="space-y-2">
              <Label htmlFor="tier-base">Start from</Label>
              <select
                id="tier-base"
                className={selectClassName}
                aria-invalid={errors.baseTierId ? true : undefined}
                {...form.register('baseTierId', { setValueAs: (value) => value || null })}
              >
                <option value="">Choose a tier…</option>
                {baseTiers.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
              <FieldError message={errors.baseTierId?.message} />
            </div>
          ) : null}

          {basis !== 'NONE' ? (
            <div className="space-y-2">
              <Label htmlFor="tier-multiplier">Multiplier</Label>
              <Controller
                control={form.control}
                name="multiplierBps"
                render={({ field }) => (
                  <MultiplierInput
                    id="tier-multiplier"
                    className="max-w-40"
                    value={field.value}
                    onChange={field.onChange}
                    invalid={!!errors.multiplierBps}
                  />
                )}
              />
              <FieldError message={errors.multiplierBps?.message} />
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                {example ?? 'Use 2.4 for “cost × 2.4”, 1.15 for +15%, 0.9 for −10%.'}
              </p>
            </div>
          ) : null}

          <FieldError message={errors.root?.server?.message} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              {tier ? 'Save tier' : 'Create tier'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
