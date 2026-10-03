'use client';

import {
  formatCents,
  type HiddenReason,
  type MenuDishDto,
  type MenuPreviewDto,
  type MenuSectionDto,
} from '@fernleaf/shared';
import { EyeOff, Flame, Lock, Snowflake, TriangleAlert, UtensilsCrossed } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { selectClassName } from '@/lib/catalogue-queries';
import { useCompanies, useEmployees } from '@/lib/company-queries';
import { useMenuPreview } from '@/lib/menu-queries';

const REASON_LABELS: Record<HiddenReason, string> = {
  CATEGORY_INACTIVE: 'Category off',
  CATEGORY_HIDDEN_FOR_COMPANY: 'Hidden for company',
  ITEM_INACTIVE: 'Item off',
  ITEM_HIDDEN_FOR_COMPANY: 'Hidden for company',
  DISH_INACTIVE: 'Dish off',
  NO_PRICE: 'No price',
  REQUIRED_GROUP_EMPTY: 'Can’t be ordered',
};

/** Spec 4.2: the menu exactly as a given employee would see it - and why the rest is hidden. */
export function MenuPreview({ initialCompanyId }: { initialCompanyId: string | null }) {
  const companies = useCompanies('', 'active');
  const [companyId, setCompanyId] = useState(initialCompanyId ?? '');
  const [employeeId, setEmployeeId] = useState('');
  const employees = useEmployees({ companyId, status: 'active', pageSize: 100 }, companyId !== '');
  const preview = useMenuPreview(employeeId || null);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-[1_1_14rem] space-y-2">
            <Label htmlFor="preview-company">Company</Label>
            <select
              id="preview-company"
              className={selectClassName}
              value={companyId}
              onChange={(event) => {
                setCompanyId(event.target.value);
                setEmployeeId('');
              }}
            >
              <option value="">Choose a company…</option>
              {(companies.data ?? []).map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 flex-[1_1_14rem] space-y-2">
            <Label htmlFor="preview-employee">Employee</Label>
            <select
              id="preview-employee"
              className={selectClassName}
              value={employeeId}
              disabled={!companyId}
              onChange={(event) => setEmployeeId(event.target.value)}
            >
              <option value="">Choose an employee…</option>
              {(employees.data?.items ?? []).map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.firstName} {employee.lastName}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {!employeeId ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Pick a company and an employee to see their menu, with their prices.
        </p>
      ) : preview.isPending ? (
        <Skeleton className="h-96" />
      ) : preview.isError ? (
        <p className="text-sm text-destructive">{preview.error.message}</p>
      ) : (
        <PreviewBody menu={preview.data} />
      )}
    </div>
  );
}

function PreviewBody({ menu }: { menu: MenuPreviewDto }) {
  return (
    <div className="space-y-8">
      <div className="rounded-2xl border bg-accent/50 p-5">
        <p className="text-xs font-bold tracking-[0.12em] text-terracotta-foreground uppercase">
          Menu for
        </p>
        <p className="mt-1 font-display text-2xl font-semibold">
          {menu.employee.name} · {menu.company.name}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Priced on the <strong className="text-foreground">{menu.tier.name}</strong> tier
          {menu.tier.fromCompany
            ? ' (the company’s tier)'
            : ' (the default - the company has no tier)'}
          .
        </p>
        {menu.employee.allergies.length > 0 || menu.employee.dietaryPreferences.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {menu.employee.allergies.map((allergen) => (
              <Badge key={allergen.id} variant="destructive">
                <TriangleAlert /> Allergic to {allergen.name}
              </Badge>
            ))}
            {menu.employee.dietaryPreferences.map((tag) => (
              <Badge key={tag.id} variant="success">
                Prefers {tag.name}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      {menu.sections.length === 0 && menu.secretSections.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          Nothing on this employee’s menu. See below for why.
        </p>
      ) : null}
      {menu.sections.map((section) => (
        <Section key={section.categoryId} section={section} />
      ))}

      {menu.secretSections.length > 0 ? (
        <div className="space-y-6 rounded-2xl border border-dashed p-5">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="size-4" /> Secret categories: not listed on the menu, but staff can
            still order these for this employee.
          </p>
          {menu.secretSections.map((section) => (
            <Section key={section.categoryId} section={section} />
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <EyeOff className="size-4" /> Not on this menu
          </CardTitle>
          <CardDescription>Everything hidden from this employee, and why.</CardDescription>
        </CardHeader>
        <CardContent>
          {menu.hidden.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is hidden.</p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {menu.hidden.map((entry, index) => (
                <li key={index} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <Badge variant="secondary">{REASON_LABELS[entry.reason]}</Badge>
                  <span className="font-medium">
                    {entry.dishName ?? `All of ${entry.categoryName}`}
                  </span>
                  {entry.dishName ? (
                    <span className="text-muted-foreground">in {entry.categoryName}</span>
                  ) : null}
                  <span className="ml-auto text-muted-foreground">{entry.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Section({ section }: { section: MenuSectionDto }) {
  return (
    <section>
      <h2 className="font-display text-xl font-semibold">{section.name}</h2>
      {section.description ? (
        <p className="text-sm text-muted-foreground">{section.description}</p>
      ) : null}
      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {section.dishes.map((dish) => (
          <DishCard key={dish.menuItemId} dish={dish} />
        ))}
      </div>
    </section>
  );
}

function DishCard({ dish }: { dish: MenuDishDto }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-card">
      {dish.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dish.imageUrl} alt="" className="h-36 w-full object-cover" />
      ) : (
        <div className="flex h-24 items-center justify-center bg-[linear-gradient(135deg,oklch(0.95_0.03_80),oklch(0.92_0.04_60))]">
          <UtensilsCrossed className="size-6 text-terracotta" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="font-semibold">{dish.name}</p>
          <p className="font-semibold text-primary tabular-nums">{formatCents(dish.priceCents)}</p>
        </div>
        {dish.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">{dish.description}</p>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">
            {dish.temperature === 'HOT' ? <Flame /> : <Snowflake />}
            {dish.temperature === 'HOT' ? 'Hot' : 'Cold'}
          </Badge>
          {dish.dietaryTags.map((tag) => (
            <Badge key={tag.id} variant="success">
              {tag.name}
            </Badge>
          ))}
          {dish.allergyWarnings.map((name) => (
            <Badge key={name} variant="destructive">
              <TriangleAlert /> Contains {name}
            </Badge>
          ))}
        </div>
        {dish.optionGroups.map((group) => (
          <div key={group.id} className="rounded-lg bg-muted/60 px-3 py-2 text-xs">
            <p className="font-medium">
              {group.name}{' '}
              <span className="font-normal text-muted-foreground">
                ({group.isRequired ? 'required' : 'optional'}
                {group.maxSelections > 1 ? `, up to ${group.maxSelections}` : ''})
              </span>
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {group.options
                .map((option) => {
                  const sizes = option.sizes
                    .map((size) =>
                      size.extraChargeCents > 0
                        ? `${size.name} +${formatCents(size.extraChargeCents)}`
                        : size.name,
                    )
                    .join(' / ');
                  const price = option.priceCents > 0 ? ` +${formatCents(option.priceCents)}` : '';
                  return `${option.name}${price}${sizes ? ` (${sizes})` : ''}`;
                })
                .join(' · ')}
            </p>
          </div>
        ))}
        {dish.minOrderQuantity ? (
          <p className="text-xs text-muted-foreground">Minimum {dish.minOrderQuantity} per order</p>
        ) : null}
      </div>
    </div>
  );
}
