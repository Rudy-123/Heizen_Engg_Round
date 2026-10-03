'use client';

import type { CompanyDetailDto } from '@fernleaf/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { companiesQueryKey, companyQueryKey, useCompany } from '@/lib/company-queries';
import { describeWorkingDays } from '../companies-view';
import { EmployeesTab } from './employees-tab';
import { MenuPriceTab } from './menu-price-tab';
import { OverviewTab } from './overview-tab';
import { PlacesTab } from './places-tab';

const TABS = ['overview', 'places', 'menu', 'employees'] as const;
type Tab = (typeof TABS)[number];

/** After any change the API returns the whole company; this puts it on screen everywhere. */
export function useCompanySaved(id: string) {
  const queryClient = useQueryClient();
  return (company: CompanyDetailDto) => {
    queryClient.setQueryData(companyQueryKey(id), company);
    void queryClient.invalidateQueries({ queryKey: [...companiesQueryKey, 'list'] });
  };
}

export function CompanyEditor({ id }: { id: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const requested = useSearchParams().get('tab');
  const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : 'overview';
  const company = useCompany(id);

  const back = (
    <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
      <Link href="/companies">
        <ArrowLeft /> All companies
      </Link>
    </Button>
  );

  if (company.isPending) {
    return (
      <div className="space-y-4">
        {back}
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (company.isError) {
    return (
      <div>
        {back}
        <p className="text-sm text-destructive">{company.error.message}</p>
      </div>
    );
  }

  const data = company.data;
  return (
    <div className="mx-auto max-w-5xl">
      {back}
      <PageHeader
        title={data.name}
        description={`${data.domains.map((d) => d.domain).join(' · ')} · ${data.employeeCount} active employees · delivers ${describeWorkingDays(data.workingDays)}`}
        actions={
          <>
            <Badge variant="secondary">
              <Building2 /> {data.effectiveTier ? data.effectiveTier.name : 'No tier'}
              {data.effectiveTier?.isDefault ? ' (default)' : ''}
            </Badge>
            {data.isActive ? (
              <Badge variant="success">Active</Badge>
            ) : (
              <Badge variant="secondary">Switched off</Badge>
            )}
          </>
        }
      />
      <Tabs value={tab} onValueChange={(value) => router.replace(`${pathname}?tab=${value}`)}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="places">Domains & addresses</TabsTrigger>
          <TabsTrigger value="menu">Menu & price</TabsTrigger>
          <TabsTrigger value="employees">Employees</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab key={data.updatedAt} company={data} />
        </TabsContent>
        <TabsContent value="places">
          <PlacesTab company={data} />
        </TabsContent>
        <TabsContent value="menu">
          <MenuPriceTab key={data.updatedAt} company={data} />
        </TabsContent>
        <TabsContent value="employees">
          <EmployeesTab company={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
