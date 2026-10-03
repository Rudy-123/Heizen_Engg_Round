'use client';

import { employeeInputSchema, type EmployeeDto, type EmployeeInput } from '@fernleaf/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FieldError } from '@/components/field-error';
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
import { selectClassName, useReferenceData } from '@/lib/catalogue-queries';
import { companiesQueryKey, employeesQueryKey, useCompanies } from '@/lib/company-queries';
import { applyServerErrors } from '@/lib/form-errors';
import { menuQueryKey } from '@/lib/menu-queries';

type FormInput = z.input<typeof employeeInputSchema>;

const FLAGS = [
  {
    name: 'canChooseAddress',
    label: 'Can choose their delivery address',
    text: 'Otherwise orders go to the company’s default address.',
  },
  {
    name: 'canChangeDeliveryTime',
    label: 'Can change the delivery time',
    text: 'Otherwise the company’s default delivery time is used.',
  },
  {
    name: 'canChangePackaging',
    label: 'Can change packaging',
    text: 'Otherwise the company’s default packaging is used.',
  },
] as const;

/** Create an employee, or edit one - including moving them to another company. */
export function EmployeeDialog({
  employee,
  companyId,
  onClose,
}: {
  employee: EmployeeDto | null;
  companyId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const reference = useReferenceData();
  const companies = useCompanies();
  const form = useForm<FormInput, unknown, EmployeeInput>({
    resolver: zodResolver(employeeInputSchema),
    defaultValues: employee
      ? {
          companyId: employee.company.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email,
          phone: employee.phone,
          canChooseAddress: employee.canChooseAddress,
          canChangeDeliveryTime: employee.canChangeDeliveryTime,
          canChangePackaging: employee.canChangePackaging,
          allergenIds: employee.allergenIds,
          dietaryTagIds: employee.dietaryTagIds,
          isActive: employee.isActive,
        }
      : { companyId, firstName: '', lastName: '', email: '', phone: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const moving = employee !== null && form.watch('companyId') !== employee.company.id;

  const save = useMutation({
    mutationFn: (input: EmployeeInput) =>
      employee
        ? api.put<EmployeeDto>(`/employees/${employee.id}`, input)
        : api.post<EmployeeDto>('/employees', input),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: employeesQueryKey });
      void queryClient.invalidateQueries({ queryKey: companiesQueryKey });
      void queryClient.invalidateQueries({ queryKey: menuQueryKey });
      toast.success(
        moving
          ? `${saved.firstName} moved to ${saved.company.name}`
          : `Saved ${saved.firstName} ${saved.lastName}`,
      );
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

  const text = (name: 'firstName' | 'lastName' | 'email' | 'phone', label: string) => (
    <div className="space-y-2">
      <Label htmlFor={`employee-${name}`}>{label}</Label>
      <Input
        id={`employee-${name}`}
        type={name === 'email' ? 'email' : 'text'}
        aria-invalid={errors[name] ? true : undefined}
        {...form.register(name)}
      />
      <FieldError message={errors[name]?.message} />
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {employee ? `${employee.firstName} ${employee.lastName}` : 'New employee'}
          </DialogTitle>
          <DialogDescription>
            Employees don’t sign in - staff order for them. Their email must be on one of their
            company’s domains.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {text('firstName', 'First name')}
            {text('lastName', 'Last name')}
            {text('email', 'Work email')}
            {text('phone', 'Phone (optional)')}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="employee-company">Company</Label>
              <select
                id="employee-company"
                className={selectClassName}
                aria-invalid={errors.companyId ? true : undefined}
                {...form.register('companyId')}
              >
                {(companies.data ?? []).map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
              <FieldError message={errors.companyId?.message} />
              {moving ? (
                <p className="rounded-lg bg-warning/15 px-3 py-2 text-xs text-warning-foreground">
                  Moving changes their menu, prices, addresses and calendar to the new company’s.
                  Use an email on the new company’s domain. Confirmed orders stay billed to the old
                  company.
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            {FLAGS.map((flag) => (
              <label
                key={flag.name}
                className="flex items-center justify-between gap-4 rounded-xl border px-4 py-2.5"
              >
                <span>
                  <span className="block text-sm font-medium">{flag.label}</span>
                  <span className="block text-xs text-muted-foreground">{flag.text}</span>
                </span>
                <Controller
                  control={form.control}
                  name={flag.name}
                  render={({ field }) => (
                    <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
                  )}
                />
              </label>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Allergies</Label>
              <Controller
                control={form.control}
                name="allergenIds"
                render={({ field }) => (
                  <ToggleChips
                    items={reference.data?.allergens ?? []}
                    value={field.value ?? []}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>Dietary preferences</Label>
              <Controller
                control={form.control}
                name="dietaryTagIds"
                render={({ field }) => (
                  <ToggleChips
                    items={reference.data?.['dietary-tags'] ?? []}
                    value={field.value ?? []}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
          </div>

          {employee ? (
            <label className="flex items-center gap-3 text-sm">
              <Controller
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <Switch checked={field.value ?? true} onCheckedChange={field.onChange} />
                )}
              />
              Active
            </label>
          ) : null}
          <FieldError message={errors.isActive?.message ?? errors.root?.server?.message} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              {employee ? (moving ? 'Move employee' : 'Save employee') : 'Add employee'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
