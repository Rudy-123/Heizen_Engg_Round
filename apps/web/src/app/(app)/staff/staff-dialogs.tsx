'use client';

import {
  createStaffSchema,
  resetPasswordSchema,
  updateStaffSchema,
  type RoleDto,
  type StaffMemberDto,
} from '@fernleaf/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Lock } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
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
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { selectClassName } from '@/lib/catalogue-queries';
import { applyServerErrors } from '@/lib/form-errors';
import { staffQueryKey } from './staff-view';

// One form for both modes, so both schemas get the same fields: creating checks the password
// (and ignores "active"); editing checks "active" (and has no password box).
const createForm = createStaffSchema.extend({ isActive: z.boolean() });
const editForm = updateStaffSchema.extend({ password: z.string() });
type FormInput = z.input<typeof createForm>;
type FormValues = z.output<typeof createForm>;

/** Create a staff account, or edit one (name, email, phone, role, active). */
export function StaffDialog({
  person,
  roles,
  onClose,
}: {
  person: StaffMemberDto | null;
  roles: RoleDto[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isNew = person === null;
  const locked = person?.isReviewerAccount ?? false;
  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(isNew ? createForm : editForm),
    defaultValues: {
      name: person?.name ?? '',
      email: person?.email ?? '',
      phone: person?.phone ?? '',
      roleId: person?.role.id ?? roles.find((role) => role.key === 'driver')?.id ?? '',
      isActive: person?.isActive ?? true,
      password: '',
    },
  });
  const { errors, isSubmitting } = form.formState;

  const save = useMutation({
    mutationFn: ({ password, isActive, ...details }: FormValues) =>
      isNew
        ? api.post<StaffMemberDto>('/staff', { ...details, password })
        : api.put<StaffMemberDto>(`/staff/${person.id}`, { ...details, isActive }),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: staffQueryKey });
      toast.success(isNew ? `Added ${saved.name} as ${saved.role.name}` : `Saved ${saved.name}`);
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

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? 'New staff member' : `Edit ${person.name}`}</DialogTitle>
          <DialogDescription>
            {isNew
              ? 'No emails are sent: give them their first password yourself.'
              : 'Role changes and switching off take effect on their very next click.'}
          </DialogDescription>
        </DialogHeader>
        {locked ? (
          <p className="flex items-start gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground">
            <Lock className="mt-0.5 size-4 shrink-0" />A reviewer account: its email, role and
            password stay exactly as the assignment gives them. Only the name and phone can change.
          </p>
        ) : null}
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="staff-name">Name</Label>
              <Input
                id="staff-name"
                aria-invalid={errors.name ? true : undefined}
                {...form.register('name')}
              />
              <FieldError message={errors.name?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-phone">Phone (optional)</Label>
              <Input id="staff-phone" {...form.register('phone')} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="staff-email">Email (they sign in with it)</Label>
              <Input
                id="staff-email"
                type="email"
                disabled={locked}
                aria-invalid={errors.email ? true : undefined}
                {...form.register('email')}
              />
              <FieldError message={errors.email?.message} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="staff-role">Role</Label>
              <select
                id="staff-role"
                className={selectClassName}
                disabled={locked}
                aria-invalid={errors.roleId ? true : undefined}
                {...form.register('roleId')}
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name} - {role.description}
                  </option>
                ))}
              </select>
              <FieldError message={errors.roleId?.message} />
            </div>
            {isNew ? (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="staff-password">First password</Label>
                <Input
                  id="staff-password"
                  type="text"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  aria-invalid={errors.password ? true : undefined}
                  {...form.register('password')}
                />
                <FieldError message={errors.password?.message} />
              </div>
            ) : null}
          </div>
          {!isNew && !locked ? (
            <label className="flex items-center gap-3 text-sm">
              <Controller
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <Switch checked={field.value ?? true} onCheckedChange={field.onChange} />
                )}
              />
              Active - switched-off staff can’t sign in
            </label>
          ) : null}
          <FieldError message={errors.isActive?.message ?? errors.root?.server?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              {isNew ? 'Add staff member' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PasswordDialog({
  person,
  onClose,
}: {
  person: StaffMemberDto;
  onClose: () => void;
}) {
  const form = useForm<{ password: string }>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const save = useMutation({
    mutationFn: (input: { password: string }) =>
      api.put<StaffMemberDto>(`/staff/${person.id}/password`, input),
    onSuccess: () => {
      toast.success(`New password set for ${person.name}`);
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

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New password for {person.name}</DialogTitle>
          <DialogDescription>Their old password stops working straight away.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="text"
              autoComplete="new-password"
              aria-invalid={errors.password ? true : undefined}
              {...form.register('password')}
            />
            <FieldError message={errors.password?.message ?? errors.root?.server?.message} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Set password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
