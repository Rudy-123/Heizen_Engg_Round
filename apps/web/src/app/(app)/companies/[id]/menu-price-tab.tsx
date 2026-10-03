'use client';

import type { CompanyDetailDto, CompanyMenuHidingInput } from '@fernleaf/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { selectClassName } from '@/lib/catalogue-queries';
import { companyQueryKey } from '@/lib/company-queries';
import { menuQueryKey, useMenuCategories } from '@/lib/menu-queries';
import { useTiers } from '@/lib/pricing-queries';
import { useCan } from '@/lib/session';
import { cn } from '@/lib/utils';
import { useCompanySaved } from './company-editor';
import { toDetailsInput } from './overview-tab';

/** Spec 4.4 "Menu and price": the company's price tier and what its employees never see. */
export function MenuPriceTab({ company }: { company: CompanyDetailDto }) {
  return (
    <div className="space-y-6">
      <TierCard company={company} />
      <HidingCard company={company} />
    </div>
  );
}

function TierCard({ company }: { company: CompanyDetailDto }) {
  const canEdit = useCan('COMPANIES_WRITE');
  const saved = useCompanySaved(company.id);
  const tiers = useTiers();
  const [tierId, setTierId] = useState(company.priceTierId ?? '');
  const defaultTier = tiers.data?.find((tier) => tier.isDefault);

  const save = useMutation({
    mutationFn: () =>
      api.put<CompanyDetailDto>(`/companies/${company.id}`, {
        ...toDetailsInput(company),
        priceTierId: tierId || null,
      }),
    onSuccess: (result) => {
      saved(result);
      toast.success('Price tier saved - new orders use it');
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Price tier</CardTitle>
        <CardDescription>
          Employees are priced on this tier, or on the default tier if none is chosen. Orders
          already placed keep their prices.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 space-y-2">
          <Label htmlFor="company-tier">Tier</Label>
          <select
            id="company-tier"
            className={selectClassName}
            value={tierId}
            disabled={!canEdit}
            onChange={(event) => setTierId(event.target.value)}
          >
            <option value="">
              Default tier{defaultTier ? ` (currently ${defaultTier.name})` : ''}
            </option>
            {(tiers.data ?? []).map((tier) => (
              <option key={tier.id} value={tier.id}>
                {tier.name}
              </option>
            ))}
          </select>
        </div>
        {canEdit ? (
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || tierId === (company.priceTierId ?? '')}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : null}
            Save tier
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function HidingCard({ company }: { company: CompanyDetailDto }) {
  const canEdit = useCan('MENU_WRITE');
  const queryClient = useQueryClient();
  const categories = useMenuCategories();
  const [hiddenCategories, setHiddenCategories] = useState(new Set(company.hiddenCategoryIds));
  const [hiddenItems, setHiddenItems] = useState(new Set(company.hiddenMenuItemIds));
  const dirty =
    !sameSet(hiddenCategories, company.hiddenCategoryIds) ||
    !sameSet(hiddenItems, company.hiddenMenuItemIds);

  const save = useMutation({
    mutationFn: () =>
      api.put<CompanyMenuHidingInput>(`/menu/hiding/${company.id}`, {
        hiddenCategoryIds: [...hiddenCategories],
        hiddenMenuItemIds: [...hiddenItems],
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: companyQueryKey(company.id) });
      void queryClient.invalidateQueries({ queryKey: menuQueryKey });
      toast.success(`Saved what ${company.name} sees`);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not save.'),
  });

  const toggle = (set: Set<string>, id: string, update: (next: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update(next);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Hidden from {company.name}</CardTitle>
            <CardDescription>
              Hide a whole category, or a dish in one category (the same dish elsewhere stays
              visible). Dishes with no price on the tier are hidden automatically.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/menu?tab=preview&company=${company.id}`}>
              <Eye /> Preview as an employee
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {categories.isPending ? (
          <Skeleton className="h-40" />
        ) : categories.isError ? (
          <p className="text-sm text-destructive">{categories.error.message}</p>
        ) : categories.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">The menu has no categories yet.</p>
        ) : (
          categories.data.map((category) => {
            const categoryHidden = hiddenCategories.has(category.id);
            return (
              <div key={category.id} className="rounded-xl border">
                <label className="flex cursor-pointer items-center gap-3 border-b bg-muted/40 px-4 py-2.5">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={categoryHidden}
                    disabled={!canEdit}
                    onChange={() => toggle(hiddenCategories, category.id, setHiddenCategories)}
                  />
                  <span className="flex-1 font-medium">{category.name}</span>
                  {category.isSecret ? (
                    <Badge variant="outline">
                      <Lock /> Secret
                    </Badge>
                  ) : null}
                  {!category.isActive ? <Badge variant="secondary">Off for everyone</Badge> : null}
                  {categoryHidden ? (
                    <Badge variant="destructive">
                      <EyeOff /> Hidden
                    </Badge>
                  ) : null}
                </label>
                <ul className={cn('divide-y', categoryHidden && 'opacity-50')}>
                  {category.items.map((item) => (
                    <li key={item.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-4 py-2 pl-10 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={categoryHidden || hiddenItems.has(item.id)}
                          disabled={!canEdit || categoryHidden}
                          onChange={() => toggle(hiddenItems, item.id, setHiddenItems)}
                        />
                        <span className="flex-1">{item.dish.name}</span>
                        {hiddenItems.has(item.id) && !categoryHidden ? (
                          <span className="text-xs text-destructive">Hidden here</span>
                        ) : null}
                      </label>
                    </li>
                  ))}
                  {category.items.length === 0 ? (
                    <li className="px-4 py-2 pl-10 text-sm text-muted-foreground">No dishes.</li>
                  ) : null}
                </ul>
              </div>
            );
          })
        )}
        {canEdit ? (
          <div className="flex justify-end">
            <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : null}
              Save hidden items
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function sameSet(set: Set<string>, list: string[]): boolean {
  return set.size === list.length && list.every((id) => set.has(id));
}
