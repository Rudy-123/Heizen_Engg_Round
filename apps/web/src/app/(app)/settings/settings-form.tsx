'use client';

import {
  updateSettingsSchema,
  type PlatformSettingsDto,
  type UpdateSettingsInput,
} from '@fernleaf/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FieldError } from '@/components/field-error';
import { TimeInput } from '@/components/time-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { WeekdayPicker } from '@/components/weekday-picker';
import { api } from '@/lib/api';
import { formatInstant } from '@/lib/format';
import { applyServerErrors } from '@/lib/form-errors';
import { cutoffPreviewQueryKey } from './cutoff-preview-card';

type FormInput = z.input<typeof updateSettingsSchema>;

function toFormValues(settings: PlatformSettingsDto): FormInput {
  const {
    kitchenTimeZone: _zone,
    kitchenHolidays: _holidays,
    updatedAt: _updated,
    ...values
  } = settings;
  return values;
}

export function SettingsForm({
  settings,
  canEdit,
}: {
  settings: PlatformSettingsDto;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const form = useForm<FormInput, unknown, UpdateSettingsInput>({
    resolver: zodResolver(updateSettingsSchema),
    defaultValues: toFormValues(settings),
  });
  const { errors, isDirty, isSubmitting } = form.formState;

  const save = useMutation({
    mutationFn: (input: UpdateSettingsInput) => api.put<PlatformSettingsDto>('/settings', input),
    onSuccess: (saved) => {
      queryClient.setQueryData(['settings'], saved);
      void queryClient.invalidateQueries({ queryKey: cutoffPreviewQueryKey });
      form.reset(toFormValues(saved));
      toast.success('Settings saved');
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
      <fieldset disabled={!canEdit || isSubmitting} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Kitchen calendar and cut-off</CardTitle>
            <CardDescription>
              Orders for a delivery date lock at the cut-off time, a number of kitchen working days
              before delivery. Kitchen holidays and non-working days are skipped when counting back.
              Kitchen time zone: <strong>{settings.kitchenTimeZone}</strong> (set when the app is
              deployed).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Kitchen working days</Label>
              <Controller
                control={form.control}
                name="kitchenWorkingDays"
                render={({ field }) => (
                  <WeekdayPicker
                    label="Kitchen working days"
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <FieldError message={errors.kitchenWorkingDays?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cutoffTime">Cut-off</Label>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>Orders lock at</span>
                <Controller
                  control={form.control}
                  name="cutoffTimeMinutes"
                  render={({ field }) => (
                    <TimeInput
                      id="cutoffTime"
                      value={field.value}
                      onChange={field.onChange}
                      invalid={!!errors.cutoffTimeMinutes}
                    />
                  )}
                />
                <Input
                  type="number"
                  min={0}
                  max={30}
                  className="w-20"
                  aria-label="Kitchen working days before delivery"
                  aria-invalid={errors.cutoffDaysBefore ? true : undefined}
                  {...form.register('cutoffDaysBefore', { valueAsNumber: true })}
                />
                <span>kitchen working days before delivery.</span>
              </div>
              <FieldError message={errors.cutoffTimeMinutes?.message} />
              <FieldError message={errors.cutoffDaysBefore?.message} />
            </div>

            <div className="flex items-start justify-between gap-6 rounded-lg border p-4">
              <div>
                <Label htmlFor="autoCutoff">Process cut-offs automatically</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  When a cut-off passes, drafts for that date are cancelled and placed orders are
                  confirmed. Turn this off to only process from the Cut-offs page with “Run now”.
                </p>
              </div>
              <Controller
                control={form.control}
                name="autoCutoffProcessing"
                render={({ field }) => (
                  <Switch
                    id="autoCutoff"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={!canEdit}
                  />
                )}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Timing</CardTitle>
            <CardDescription>
              How the kitchen and dispatch boards judge time, and which delivery times can be chosen
              for employees allowed to change theirs.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="atRisk">“At risk” warning (minutes)</Label>
              <Input
                id="atRisk"
                type="number"
                min={0}
                className="w-28"
                aria-invalid={errors.atRiskMinutes ? true : undefined}
                {...form.register('atRiskMinutes', { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">
                Kitchen work not ready this close to its planned ready time is flagged.
              </p>
              <FieldError message={errors.atRiskMinutes?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="grace">On-time grace (minutes)</Label>
              <Input
                id="grace"
                type="number"
                min={0}
                className="w-28"
                aria-invalid={errors.onTimeGraceMinutes ? true : undefined}
                {...form.register('onTimeGraceMinutes', { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">
                A delivery this many minutes after the agreed time still counts as on time.
              </p>
              <FieldError message={errors.onTimeGraceMinutes?.message} />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="windowStart">Delivery times employees can choose</Label>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>From</span>
                <Controller
                  control={form.control}
                  name="deliveryWindowStartMinutes"
                  render={({ field }) => (
                    <TimeInput
                      id="windowStart"
                      value={field.value}
                      onChange={field.onChange}
                      invalid={!!errors.deliveryWindowStartMinutes}
                    />
                  )}
                />
                <span>to</span>
                <Controller
                  control={form.control}
                  name="deliveryWindowEndMinutes"
                  render={({ field }) => (
                    <TimeInput
                      id="windowEnd"
                      value={field.value}
                      onChange={field.onChange}
                      invalid={!!errors.deliveryWindowEndMinutes}
                    />
                  )}
                />
                <span>every</span>
                <select
                  className="h-9 rounded-md border border-input bg-card px-2 text-sm shadow-xs"
                  aria-label="Delivery time step"
                  {...form.register('deliverySlotMinutes', { valueAsNumber: true })}
                >
                  {[5, 10, 15, 20, 30, 60].map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} minutes
                    </option>
                  ))}
                </select>
              </div>
              <FieldError message={errors.deliveryWindowStartMinutes?.message} />
              <FieldError message={errors.deliveryWindowEndMinutes?.message} />
              <FieldError message={errors.deliverySlotMinutes?.message} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Public email domains</CardTitle>
            <CardDescription>
              No company can claim these as its own domain (spec: “public domains such as gmail.com
              are not allowed”). One per line.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Controller
              control={form.control}
              name="publicEmailDomains"
              render={({ field }) => (
                <Textarea
                  rows={6}
                  className="font-mono text-sm"
                  value={field.value.join('\n')}
                  onChange={(event) =>
                    field.onChange(
                      event.target.value
                        .split('\n')
                        .map((line) => line.trim())
                        .filter(Boolean),
                    )
                  }
                  aria-invalid={errors.publicEmailDomains ? true : undefined}
                />
              )}
            />
            <FieldError
              message={
                errors.publicEmailDomains?.message ??
                (Array.isArray(errors.publicEmailDomains)
                  ? errors.publicEmailDomains.find(Boolean)?.message
                  : undefined)
              }
            />
          </CardContent>
        </Card>

        {errors.root?.server ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{errors.root.server.message}</AlertDescription>
          </Alert>
        ) : null}

        {canEdit ? (
          <div className="flex items-center justify-end gap-3">
            <p className="mr-auto text-xs text-muted-foreground">
              Last saved {formatInstant(settings.updatedAt, settings.kitchenTimeZone)}
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={!isDirty || isSubmitting}
              onClick={() => form.reset(toFormValues(settings))}
            >
              Discard changes
            </Button>
            <Button type="submit" disabled={!isDirty || isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Save changes
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Your role can view these settings but not change them.
          </p>
        )}
      </fieldset>
    </form>
  );
}
