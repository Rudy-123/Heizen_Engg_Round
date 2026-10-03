'use client';

import {
  createCompanySchema,
  type CompanyDetailDto,
  type CreateCompanyInput,
} from '@fernleaf/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FieldError } from '@/components/field-error';
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
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { companiesQueryKey } from '@/lib/company-queries';
import { applyServerErrors } from '@/lib/form-errors';

type FormInput = z.input<typeof createCompanySchema>;

/**
 * A company always has at least one email domain and one delivery address (spec 4.4), so
 * it starts with one of each. Everything else has sensible defaults and is edited after.
 */
export function NewCompanyDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<FormInput, unknown, CreateCompanyInput>({
    resolver: zodResolver(createCompanySchema),
    defaultValues: {
      name: '',
      domain: '',
      billingContactName: '',
      billingEmail: '',
      billingAddress: '',
      address: { label: 'Head office', line1: '', city: '', postcode: '' },
    },
  });
  const { errors, isSubmitting } = form.formState;

  const create = useMutation({
    mutationFn: (input: CreateCompanyInput) => api.post<CompanyDetailDto>('/companies', input),
    onSuccess: (company) => {
      void queryClient.invalidateQueries({ queryKey: companiesQueryKey });
      toast.success(`Added ${company.name}`);
      onClose();
      router.push(`/companies/${company.id}`);
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await create.mutateAsync(values);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  const field = (
    name: Parameters<typeof form.register>[0],
    label: string,
    message: string | undefined,
    placeholder?: string,
  ) => (
    <div className="space-y-2">
      <Label htmlFor={`new-${name}`}>{label}</Label>
      <Input
        id={`new-${name}`}
        placeholder={placeholder}
        aria-invalid={message ? true : undefined}
        {...form.register(name)}
      />
      <FieldError message={message} />
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New company</DialogTitle>
          <DialogDescription>
            Start with one email domain and one delivery address. Calendar, delivery defaults, price
            tier and the owner are set on the company’s page.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {field('name', 'Company name', errors.name?.message, 'Acme Corp')}
            {field('domain', 'Email domain', errors.domain?.message, 'acme.com')}
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Billing contact</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {field('billingContactName', 'Name', errors.billingContactName?.message)}
              {field('billingEmail', 'Email', errors.billingEmail?.message, 'accounts@acme.com')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-billingAddress">Billing address</Label>
              <Textarea
                id="new-billingAddress"
                rows={2}
                aria-invalid={errors.billingAddress ? true : undefined}
                {...form.register('billingAddress')}
              />
              <FieldError message={errors.billingAddress?.message} />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">First delivery address</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {field('address.label', 'Label', errors.address?.label?.message)}
              {field('address.line1', 'Street', errors.address?.line1?.message)}
              {field('address.city', 'City', errors.address?.city?.message)}
              {field('address.postcode', 'Postcode', errors.address?.postcode?.message)}
            </div>
          </fieldset>

          <FieldError message={errors.root?.server?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Add company
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
