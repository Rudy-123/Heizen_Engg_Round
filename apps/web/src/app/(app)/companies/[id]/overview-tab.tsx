'use client';

import {
  companyDetailsSchema,
  createKitchenHolidaySchema,
  type CompanyDetailDto,
  type CompanyDetailsInput,
  type CreateKitchenHolidayInput,
} from '@fernleaf/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Info, Loader2, Plus, Trash2 } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FieldError } from '@/components/field-error';
import { TimeInput } from '@/components/time-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { WeekdayPicker } from '@/components/weekday-picker';
import { api } from '@/lib/api';
import { selectClassName, useReferenceData } from '@/lib/catalogue-queries';
import { useDriverOptions, useEmployees } from '@/lib/company-queries';
import { formatIsoDate } from '@/lib/format';
import { applyServerErrors } from '@/lib/form-errors';
import { useCan } from '@/lib/session';
import { useCompanySaved } from './company-editor';

type FormInput = z.input<typeof companyDetailsSchema>;

/** The company's editable details, as PUT /api/companies/:id expects them. */
export function toDetailsInput(company: CompanyDetailDto): CompanyDetailsInput {
  return {
    name: company.name,
    billingContactName: company.billingContactName,
    billingEmail: company.billingEmail,
    billingPhone: company.billingPhone,
    billingAddress: company.billingAddress,
    priceTierId: company.priceTierId,
    workingDays: company.workingDays,
    defaultDeliveryTimeMinutes: company.defaultDeliveryTimeMinutes,
    deliveryLeadMinutes: company.deliveryLeadMinutes,
    defaultPackagingTypeId: company.defaultPackagingTypeId,
    driverInstructions: company.driverInstructions,
    defaultDriverId: company.defaultDriverId,
    ownerEmployeeId: company.ownerEmployeeId,
    isActive: company.isActive,
  };
}

const nullIfEmpty = { setValueAs: (value: string) => value || null };

export function OverviewTab({ company }: { company: CompanyDetailDto }) {
  const canEdit = useCan('COMPANIES_WRITE');
  const saved = useCompanySaved(company.id);
  const reference = useReferenceData();
  const drivers = useDriverOptions();
  const employees = useEmployees({ companyId: company.id, status: 'active', pageSize: 100 });
  const form = useForm<FormInput, unknown, CompanyDetailsInput>({
    resolver: zodResolver(companyDetailsSchema),
    defaultValues: toDetailsInput(company),
  });
  const { errors, isDirty, isSubmitting } = form.formState;

  const save = useMutation({
    mutationFn: (input: CompanyDetailsInput) =>
      api.put<CompanyDetailDto>(`/companies/${company.id}`, input),
    onSuccess: (result) => {
      saved(result);
      toast.success('Company saved');
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  const text = (name: keyof FormInput & string, label: string, message?: string) => (
    <div className="space-y-2">
      <Label htmlFor={`company-${name}`}>{label}</Label>
      <Input
        id={`company-${name}`}
        aria-invalid={message ? true : undefined}
        {...form.register(name)}
      />
      <FieldError message={message} />
    </div>
  );

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} noValidate>
        <fieldset disabled={!canEdit || isSubmitting} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Company and billing</CardTitle>
              <CardDescription>
                Invoices go to the billing contact. The owner is one of the company’s own employees.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {text('name', 'Company name', errors.name?.message)}
              <div className="space-y-2">
                <Label htmlFor="company-owner">Owner</Label>
                <select
                  id="company-owner"
                  className={selectClassName}
                  aria-invalid={errors.ownerEmployeeId ? true : undefined}
                  {...form.register('ownerEmployeeId', nullIfEmpty)}
                >
                  <option value="">Not set</option>
                  {(employees.data?.items ?? []).map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.firstName} {employee.lastName} ({employee.email})
                    </option>
                  ))}
                </select>
                <FieldError message={errors.ownerEmployeeId?.message} />
              </div>
              {text('billingContactName', 'Billing contact', errors.billingContactName?.message)}
              {text('billingEmail', 'Billing email', errors.billingEmail?.message)}
              {text('billingPhone', 'Billing phone (optional)', errors.billingPhone?.message)}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="company-billingAddress">Billing address</Label>
                <Textarea
                  id="company-billingAddress"
                  rows={2}
                  aria-invalid={errors.billingAddress ? true : undefined}
                  {...form.register('billingAddress')}
                />
                <FieldError message={errors.billingAddress?.message} />
              </div>
              <label className="flex items-center gap-3 text-sm sm:col-span-2">
                <Controller
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <Switch
                      checked={field.value ?? true}
                      onCheckedChange={field.onChange}
                      disabled={!canEdit}
                    />
                  )}
                />
                Active - switched-off companies can’t get new orders
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Delivery defaults</CardTitle>
              <CardDescription>
                Used for every new order unless the employee is allowed to change them.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="company-time">Default delivery time</Label>
                <Controller
                  control={form.control}
                  name="defaultDeliveryTimeMinutes"
                  render={({ field }) => (
                    <TimeInput
                      id="company-time"
                      value={field.value}
                      onChange={field.onChange}
                      invalid={!!errors.defaultDeliveryTimeMinutes}
                    />
                  )}
                />
                <FieldError message={errors.defaultDeliveryTimeMinutes?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company-lead">Leaves the kitchen (minutes before delivery)</Label>
                <Input
                  id="company-lead"
                  type="number"
                  min={0}
                  className="w-32"
                  aria-invalid={errors.deliveryLeadMinutes ? true : undefined}
                  {...form.register('deliveryLeadMinutes', { valueAsNumber: true })}
                />
                <FieldError message={errors.deliveryLeadMinutes?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company-packaging">Default packaging</Label>
                <select
                  id="company-packaging"
                  className={selectClassName}
                  {...form.register('defaultPackagingTypeId', nullIfEmpty)}
                >
                  <option value="">None</option>
                  {(reference.data?.['packaging-types'] ?? []).map((type) => (
                    <option key={type.id} value={type.id} disabled={!type.isActive}>
                      {type.name}
                    </option>
                  ))}
                </select>
                <FieldError message={errors.defaultPackagingTypeId?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company-driver">Default driver</Label>
                <select
                  id="company-driver"
                  className={selectClassName}
                  aria-invalid={errors.defaultDriverId ? true : undefined}
                  {...form.register('defaultDriverId', nullIfEmpty)}
                >
                  <option value="">None - dispatch assigns one</option>
                  {(drivers.data ?? []).map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name}
                    </option>
                  ))}
                </select>
                <FieldError message={errors.defaultDriverId?.message} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="company-instructions">Standing instructions for the driver</Label>
                <Textarea
                  id="company-instructions"
                  rows={2}
                  placeholder="e.g. Use the service lift; reception signs for the boxes."
                  {...form.register('driverInstructions')}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Working days</CardTitle>
              <CardDescription>Days the company can receive deliveries.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Controller
                control={form.control}
                name="workingDays"
                render={({ field }) => (
                  <WeekdayPicker
                    label="Company working days"
                    value={field.value ?? []}
                    onChange={field.onChange}
                    disabled={!canEdit}
                  />
                )}
              />
              <FieldError message={errors.workingDays?.message} />
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-px size-3.5 shrink-0" />
                The company calendar only blocks delivery dates. It never moves an order’s cut-off -
                only the kitchen calendar does.
              </p>
            </CardContent>
          </Card>

          <FieldError message={errors.root?.server?.message} />
          {canEdit ? (
            <div className="flex justify-end">
              <Button type="submit" disabled={!isDirty || isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin" /> : null}
                Save company
              </Button>
            </div>
          ) : null}
        </fieldset>
      </form>

      <CompanyHolidaysCard company={company} canEdit={canEdit} />
    </div>
  );
}

function CompanyHolidaysCard({
  company,
  canEdit,
}: {
  company: CompanyDetailDto;
  canEdit: boolean;
}) {
  const saved = useCompanySaved(company.id);
  const form = useForm<CreateKitchenHolidayInput>({
    resolver: zodResolver(createKitchenHolidaySchema),
    defaultValues: { date: '', name: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const add = useMutation({
    mutationFn: (input: CreateKitchenHolidayInput) =>
      api.post<CompanyDetailDto>(`/companies/${company.id}/holidays`, input),
    onSuccess: (result) => {
      saved(result);
      form.reset();
    },
  });
  const remove = useMutation({
    mutationFn: (holidayId: string) =>
      api.delete<CompanyDetailDto>(`/companies/${company.id}/holidays/${holidayId}`),
    onSuccess: saved,
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
        <CardTitle>Company holidays</CardTitle>
        <CardDescription>
          Days the office is closed: no deliveries. Cut-offs don’t move.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {company.holidays.length === 0 ? (
          <p className="text-sm text-muted-foreground">No company holidays.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {company.holidays.map((holiday) => (
              <li key={holiday.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-28 font-medium tabular-nums">
                  {formatIsoDate(holiday.date, { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <span className="flex-1 text-muted-foreground">{holiday.name}</span>
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Remove ${holiday.name}`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(holiday.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canEdit ? (
          <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-start gap-2">
            <div className="space-y-1">
              <Input type="date" aria-label="Date" className="w-44" {...form.register('date')} />
              <FieldError message={errors.date?.message} />
            </div>
            <div className="min-w-48 flex-1 space-y-1">
              <Input placeholder="e.g. Diwali" aria-label="Name" {...form.register('name')} />
              <FieldError message={errors.name?.message ?? errors.root?.server?.message} />
            </div>
            <Button type="submit" variant="outline" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : <Plus />} Add holiday
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
