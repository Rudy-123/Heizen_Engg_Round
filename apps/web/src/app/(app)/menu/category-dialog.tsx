'use client';

import {
  menuCategoryInputSchema,
  type MenuCategoryDto,
  type MenuCategoryInput,
} from '@fernleaf/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
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
import { applyServerErrors } from '@/lib/form-errors';
import { menuCategoriesQueryKey, menuQueryKey } from '@/lib/menu-queries';

export function CategoryDialog({
  category,
  onClose,
}: {
  category: MenuCategoryDto | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<z.input<typeof menuCategoryInputSchema>, unknown, MenuCategoryInput>({
    resolver: zodResolver(menuCategoryInputSchema),
    defaultValues: {
      name: category?.name ?? '',
      description: category?.description ?? '',
      isActive: category?.isActive ?? true,
      isSecret: category?.isSecret ?? false,
    },
  });
  const { errors, isSubmitting } = form.formState;

  const save = useMutation({
    mutationFn: (input: MenuCategoryInput) =>
      category
        ? api.put<MenuCategoryDto[]>(`/menu/categories/${category.id}`, input)
        : api.post<MenuCategoryDto[]>('/menu/categories', input),
    onSuccess: (categories, input) => {
      queryClient.setQueryData(menuCategoriesQueryKey, categories);
      void queryClient.invalidateQueries({ queryKey: menuQueryKey });
      toast.success(category ? `Saved ${input.name}` : `Added ${input.name}`);
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

  const toggle = (name: 'isActive' | 'isSecret', label: string, text: string) => (
    <label className="flex items-center justify-between gap-4 rounded-xl border px-4 py-2.5">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{text}</span>
      </span>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
        )}
      />
    </label>
  );

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? `Edit ${category.name}` : 'New category'}</DialogTitle>
          <DialogDescription>How dishes are grouped on employees’ menus.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              placeholder="e.g. Bowls"
              aria-invalid={errors.name ? true : undefined}
              {...form.register('name')}
            />
            <FieldError message={errors.name?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category-description">Description (optional)</Label>
            <Input id="category-description" {...form.register('description')} />
          </div>
          {toggle('isActive', 'Shown', 'Switched-off categories disappear from every menu.')}
          {toggle(
            'isSecret',
            'Secret',
            'Not listed on the menu, but still reachable - e.g. a chef’s special shared by link.',
          )}
          <FieldError message={errors.root?.server?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              {category ? 'Save category' : 'Add category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
