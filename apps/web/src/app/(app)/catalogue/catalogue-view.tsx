'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DishesTab } from './dishes-tab';
import { OptionsTab } from './options-tab';
import { ReferenceTab } from './reference-tab';

const TABS = ['dishes', 'options', 'lists'] as const;
type Tab = (typeof TABS)[number];

export function CatalogueView() {
  const router = useRouter();
  const pathname = usePathname();
  const requested = useSearchParams().get('tab');
  const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : 'dishes';

  return (
    <div>
      <PageHeader
        title="Dishes & options"
        description="Everything the kitchen can make. Dishes are switched off, never deleted - past orders still refer to them."
      />
      <Tabs value={tab} onValueChange={(value) => router.replace(`${pathname}?tab=${value}`)}>
        <TabsList>
          <TabsTrigger value="dishes">Dishes</TabsTrigger>
          <TabsTrigger value="options">Options</TabsTrigger>
          <TabsTrigger value="lists">Reference lists</TabsTrigger>
        </TabsList>
        <TabsContent value="dishes">
          <DishesTab />
        </TabsContent>
        <TabsContent value="options">
          <OptionsTab />
        </TabsContent>
        <TabsContent value="lists">
          <ReferenceTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
