'use client';

import {
  addCompanyDomainSchema,
  companyAddressInputSchema,
  type CompanyAddressDto,
  type CompanyAddressInput,
  type CompanyDetailDto,
} from '@fernleaf/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { AtSign, Loader2, MapPin, Pencil, Plus, Star, X } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FieldError } from '@/components/field-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { applyServerErrors } from '@/lib/form-errors';
import { useCan } from '@/lib/session';
import { cn } from '@/lib/utils';
import { useCompanySaved } from './company-editor';

export function PlacesTab({ company }: { company: CompanyDetailDto }) {
  const canEdit = useCan('COMPANIES_WRITE');
  return (
    <div className="space-y-6">
      <DomainsCard company={company} canEdit={canEdit} />
      <AddressesCard company={company} canEdit={canEdit} />
    </div>
  );
}

function DomainsCard({ company, canEdit }: { company: CompanyDetailDto; canEdit: boolean }) {
  const saved = useCompanySaved(company.id);
  const form = useForm<z.input<typeof addCompanyDomainSchema>, unknown, { domain: string }>({
    resolver: zodResolver(addCompanyDomainSchema),
    defaultValues: { domain: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const add = useMutation({
    mutationFn: (input: { domain: string }) =>
      api.post<CompanyDetailDto>(`/companies/${company.id}/domains`, input),
    onSuccess: (result) => {
      saved(result);
      form.reset();
    },
  });
  const remove = useMutation({
    mutationFn: (domainId: string) =>
      api.delete<CompanyDetailDto>(`/companies/${company.id}/domains/${domainId}`),
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
        <CardTitle>Email domains</CardTitle>
        <CardDescription>
          Employees’ emails must be on one of these. No two companies can share a domain, and public
          ones like gmail.com aren’t allowed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="flex flex-wrap gap-2">
          {company.domains.map((domain) => (
            <li
              key={domain.id}
              className="flex items-center gap-2 rounded-full border bg-card py-1 pr-1 pl-3 text-sm"
            >
              <AtSign className="size-3.5 text-primary" />
              <span className="font-medium">{domain.domain}</span>
              <span className="text-xs text-muted-foreground">
                {domain.employeeCount} {domain.employeeCount === 1 ? 'person' : 'people'}
              </span>
              {canEdit ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 rounded-full"
                  aria-label={`Remove ${domain.domain}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(domain.id)}
                >
                  <X className="size-3" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {canEdit ? (
          <form onSubmit={onSubmit} noValidate className="flex max-w-md items-start gap-2">
            <div className="flex-1 space-y-1">
              <Input
                placeholder="another-domain.com"
                aria-label="New domain"
                aria-invalid={errors.domain ? true : undefined}
                {...form.register('domain')}
              />
              <FieldError message={errors.domain?.message ?? errors.root?.server?.message} />
            </div>
            <Button type="submit" variant="outline" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : <Plus />} Add
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AddressesCard({ company, canEdit }: { company: CompanyDetailDto; canEdit: boolean }) {
  const saved = useCompanySaved(company.id);
  const [editing, setEditing] = useState<CompanyAddressDto | 'new' | null>(null);
  const makeDefault = useMutation({
    mutationFn: (addressId: string) =>
      api.post<CompanyDetailDto>(`/companies/${company.id}/addresses/${addressId}/make-default`),
    onSuccess: (result) => {
      saved(result);
      toast.success('Default address changed');
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Delivery addresses</CardTitle>
            <CardDescription>
              Orders go to the default address unless the employee may choose another. Addresses are
              switched off, never deleted - past deliveries still point at them.
            </CardDescription>
          </div>
          {canEdit ? (
            <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
              <Plus /> Add address
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {company.addresses.map((address) => (
          <div
            key={address.id}
            className={cn(
              'flex gap-3 rounded-xl border p-4',
              address.isDefault && 'border-primary/40 bg-accent/40',
              !address.isActive && 'opacity-60',
            )}
          >
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {address.label}
                {address.isDefault ? (
                  <Badge>
                    <Star /> Default
                  </Badge>
                ) : null}
                {!address.isActive ? <Badge variant="secondary">Switched off</Badge> : null}
              </p>
              <p className="mt-1 text-muted-foreground">
                {[address.line1, address.line2, `${address.city} ${address.postcode}`]
                  .filter(Boolean)
                  .join(', ')}
              </p>
              {address.instructions ? (
                <p className="mt-1 text-xs text-muted-foreground">“{address.instructions}”</p>
              ) : null}
              {canEdit ? (
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(address)}>
                    <Pencil /> Edit
                  </Button>
                  {!address.isDefault && address.isActive ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={makeDefault.isPending}
                      onClick={() => makeDefault.mutate(address.id)}
                    >
                      Make default
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
      {editing ? (
        <AddressDialog
          company={company}
          address={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Card>
  );
}

function AddressDialog({
  company,
  address,
  onClose,
}: {
  company: CompanyDetailDto;
  address: CompanyAddressDto | null;
  onClose: () => void;
}) {
  const saved = useCompanySaved(company.id);
  const form = useForm<z.input<typeof companyAddressInputSchema>, unknown, CompanyAddressInput>({
    resolver: zodResolver(companyAddressInputSchema),
    defaultValues: {
      label: address?.label ?? '',
      line1: address?.line1 ?? '',
      line2: address?.line2 ?? '',
      city: address?.city ?? '',
      postcode: address?.postcode ?? '',
      instructions: address?.instructions ?? '',
      isActive: address?.isActive ?? true,
    },
  });
  const { errors, isSubmitting } = form.formState;

  const save = useMutation({
    mutationFn: (input: CompanyAddressInput) =>
      address
        ? api.put<CompanyDetailDto>(`/companies/${company.id}/addresses/${address.id}`, input)
        : api.post<CompanyDetailDto>(`/companies/${company.id}/addresses`, input),
    onSuccess: (result) => {
      saved(result);
      toast.success(address ? 'Address saved' : 'Address added');
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

  const field = (
    name: 'label' | 'line1' | 'line2' | 'city' | 'postcode' | 'instructions',
    label: string,
    className?: string,
  ) => (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={`address-${name}`}>{label}</Label>
      <Input
        id={`address-${name}`}
        aria-invalid={errors[name] ? true : undefined}
        {...form.register(name)}
      />
      <FieldError message={errors[name]?.message} />
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{address ? `Edit ${address.label}` : 'New delivery address'}</DialogTitle>
          <DialogDescription>{company.name}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {field('label', 'Label', 'sm:col-span-2')}
            {field('line1', 'Street')}
            {field('line2', 'Floor, building (optional)')}
            {field('city', 'City')}
            {field('postcode', 'Postcode')}
            {field('instructions', 'Instructions for the driver (optional)', 'sm:col-span-2')}
          </div>
          {address ? (
            <label className="flex items-center gap-3 text-sm">
              <Controller
                control={form.control}
                name="isActive"
                render={({ field: active }) => (
                  <Switch checked={active.value ?? true} onCheckedChange={active.onChange} />
                )}
              />
              In use
            </label>
          ) : null}
          <FieldError message={errors.isActive?.message ?? errors.root?.server?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              {address ? 'Save address' : 'Add address'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
