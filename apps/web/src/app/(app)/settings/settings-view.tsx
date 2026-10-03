'use client';

import type { PlatformSettingsDto } from '@fernleaf/shared';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useCan } from '@/lib/session';
import { CutoffPreviewCard } from './cutoff-preview-card';
import { KitchenHolidaysCard } from './kitchen-holidays-card';
import { SettingsForm } from './settings-form';

export const settingsQueryKey = ['settings'] as const;

export function SettingsView() {
  const canEdit = useCan('SETTINGS_WRITE');
  const settings = useQuery({
    queryKey: settingsQueryKey,
    queryFn: () => api.get<PlatformSettingsDto>('/settings'),
  });

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Platform-wide values. Changes apply straight away - nothing here needs a code change."
      />

      {settings.isPending ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
          <Skeleton className="h-[560px]" />
          <Skeleton className="h-[560px]" />
        </div>
      ) : settings.isError ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>
            {settings.error.message}{' '}
            <Button variant="link" className="h-auto p-0" onClick={() => void settings.refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
          <SettingsForm settings={settings.data} canEdit={canEdit} />
          <div className="space-y-6">
            <CutoffPreviewCard timeZone={settings.data.kitchenTimeZone} />
            <KitchenHolidaysCard holidays={settings.data.kitchenHolidays} canEdit={canEdit} />
          </div>
        </div>
      )}
    </div>
  );
}
