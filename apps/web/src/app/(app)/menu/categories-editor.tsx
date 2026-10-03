'use client';

import type { MenuCategoryDto } from '@fernleaf/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Lock, Pencil, Plus, UtensilsCrossed, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api, ApiError } from '@/lib/api';
import { selectClassName, useDishes } from '@/lib/catalogue-queries';
import { menuCategoriesQueryKey, menuQueryKey, useMenuCategories } from '@/lib/menu-queries';
import { useCan } from '@/lib/session';
import { cn } from '@/lib/utils';
import { CategoryDialog } from './category-dialog';

/** Every menu write returns the whole menu; this puts it on screen. */
function useMenuWrite<T>(request: (input: T) => Promise<MenuCategoryDto[]>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (categories) => {
      queryClient.setQueryData(menuCategoriesQueryKey, categories);
      void queryClient.invalidateQueries({ queryKey: menuQueryKey });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not save the menu.'),
  });
}

function moved(ids: string[], index: number, by: -1 | 1): string[] {
  const copy = [...ids];
  const [item] = copy.splice(index, 1);
  copy.splice(index + by, 0, item as string);
  return copy;
}

export function CategoriesEditor() {
  const canEdit = useCan('MENU_WRITE');
  const categories = useMenuCategories();
  const [editing, setEditing] = useState<MenuCategoryDto | 'new' | null>(null);
  const reorder = useMenuWrite((ids: string[]) =>
    api.put<MenuCategoryDto[]>('/menu/categories/order', { ids }),
  );

  if (categories.isPending) return <Skeleton className="h-96" />;
  if (categories.isError) {
    return <p className="text-sm text-destructive">{categories.error.message}</p>;
  }
  const ids = categories.data.map((c) => c.id);

  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Button onClick={() => setEditing('new')}>
            <Plus /> New category
          </Button>
        </div>
      ) : null}
      {categories.data.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No categories yet. Add one, then put dishes in it.
          </CardContent>
        </Card>
      ) : null}
      {categories.data.map((category, index) => (
        <CategoryCard
          key={category.id}
          category={category}
          canEdit={canEdit}
          onEdit={() => setEditing(category)}
          onMove={(by) => reorder.mutate(moved(ids, index, by))}
          first={index === 0}
          last={index === categories.data.length - 1}
          busy={reorder.isPending}
        />
      ))}
      {editing ? (
        <CategoryDialog
          category={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function CategoryCard({
  category,
  canEdit,
  onEdit,
  onMove,
  first,
  last,
  busy,
}: {
  category: MenuCategoryDto;
  canEdit: boolean;
  onEdit: () => void;
  onMove: (by: -1 | 1) => void;
  first: boolean;
  last: boolean;
  busy: boolean;
}) {
  const dishes = useDishes('', 'all');
  const itemIds = category.items.map((item) => item.id);
  const update = useMenuWrite((input: { isActive: boolean }) =>
    api.put<MenuCategoryDto[]>(`/menu/categories/${category.id}`, {
      name: category.name,
      description: category.description,
      isSecret: category.isSecret,
      ...input,
    }),
  );
  const addItem = useMenuWrite((dishId: string) =>
    api.post<MenuCategoryDto[]>(`/menu/categories/${category.id}/items`, { dishId }),
  );
  const reorderItems = useMenuWrite((ids: string[]) =>
    api.put<MenuCategoryDto[]>(`/menu/categories/${category.id}/items/order`, { ids }),
  );
  const toggleItem = useMenuWrite((input: { id: string; isActive: boolean }) =>
    api.patch<MenuCategoryDto[]>(`/menu/items/${input.id}`, { isActive: input.isActive }),
  );
  const removeItem = useMenuWrite((id: string) =>
    api.delete<MenuCategoryDto[]>(`/menu/items/${id}`),
  );

  const listed = new Set(category.items.map((item) => item.dish.id));
  const addable = (dishes.data ?? []).filter((dish) => !listed.has(dish.id));

  return (
    <Card className={cn('gap-0 py-0', !category.isActive && 'opacity-70')}>
      <CardHeader className="flex flex-row flex-wrap items-center gap-3 border-b px-4 py-3">
        {canEdit ? (
          <div className="flex">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={`Move ${category.name} up`}
              disabled={first || busy}
              onClick={() => onMove(-1)}
            >
              <ArrowUp className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={`Move ${category.name} down`}
              disabled={last || busy}
              onClick={() => onMove(1)}
            >
              <ArrowDown className="size-4" />
            </Button>
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold">
            {category.name}
            {category.isSecret ? (
              <Badge variant="outline">
                <Lock /> Secret
              </Badge>
            ) : null}
            {!category.isActive ? <Badge variant="secondary">Switched off</Badge> : null}
          </p>
          {category.description ? (
            <p className="text-sm text-muted-foreground">{category.description}</p>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex items-center gap-2">
            <Switch
              checked={category.isActive}
              disabled={update.isPending}
              aria-label={
                category.isActive ? `Switch off ${category.name}` : `Switch on ${category.name}`
              }
              onCheckedChange={(isActive) => update.mutate({ isActive })}
            />
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil /> Edit
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="px-0">
        {category.items.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">No dishes in this category yet.</p>
        ) : (
          <ul className="divide-y">
            {category.items.map((item, index) => (
              <li
                key={item.id}
                className={cn('flex items-center gap-3 px-4 py-2', !item.isActive && 'opacity-60')}
              >
                {item.dish.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.dish.imageUrl} alt="" className="size-9 rounded-lg object-cover" />
                ) : (
                  <span className="flex size-9 items-center justify-center rounded-lg bg-accent">
                    <UtensilsCrossed className="size-4 text-primary/70" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.dish.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{item.dish.sku}</p>
                </div>
                {!item.dish.isActive ? <Badge variant="secondary">Dish switched off</Badge> : null}
                {canEdit ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Move ${item.dish.name} up`}
                      disabled={index === 0 || reorderItems.isPending}
                      onClick={() => reorderItems.mutate(moved(itemIds, index, -1))}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Move ${item.dish.name} down`}
                      disabled={index === category.items.length - 1 || reorderItems.isPending}
                      onClick={() => reorderItems.mutate(moved(itemIds, index, 1))}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Switch
                      checked={item.isActive}
                      disabled={toggleItem.isPending}
                      aria-label={`Show ${item.dish.name} in ${category.name}`}
                      onCheckedChange={(isActive) => toggleItem.mutate({ id: item.id, isActive })}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Take ${item.dish.name} out of ${category.name}`}
                      disabled={removeItem.isPending}
                      onClick={() => removeItem.mutate(item.id)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canEdit && addable.length > 0 ? (
          <div className="border-t px-4 py-3">
            <select
              className={cn(selectClassName, 'max-w-sm')}
              value=""
              aria-label={`Add a dish to ${category.name}`}
              disabled={addItem.isPending}
              onChange={(event) => event.target.value && addItem.mutate(event.target.value)}
            >
              <option value="">+ Add a dish…</option>
              {addable.map((dish) => (
                <option key={dish.id} value={dish.id}>
                  {dish.name}
                  {dish.isActive ? '' : ' (switched off)'}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
