'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CategoriesEditor } from './categories-editor';
import { MenuPreview } from './menu-preview';

export function MenuView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = params.get('tab') === 'preview' ? 'preview' : 'categories';

  return (
    <div>
      <PageHeader
        title="Menu"
        description="How dishes are shown to employees: categories in order, switched on or off, hidden from some companies, or secret."
      />
      <Tabs value={tab} onValueChange={(value) => router.replace(`${pathname}?tab=${value}`)}>
        <TabsList>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="preview">Employee preview</TabsTrigger>
        </TabsList>
        <TabsContent value="categories">
          <CategoriesEditor />
        </TabsContent>
        <TabsContent value="preview">
          <MenuPreview initialCompanyId={params.get('company')} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
