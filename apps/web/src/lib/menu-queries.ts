'use client';

import type { MenuCategoryDto, MenuPreviewDto } from '@fernleaf/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export const menuQueryKey = ['menu'] as const;
export const menuCategoriesQueryKey = [...menuQueryKey, 'categories'] as const;

export function useMenuCategories() {
  return useQuery({
    queryKey: menuCategoriesQueryKey,
    queryFn: () => api.get<MenuCategoryDto[]>('/menu/categories'),
  });
}

export function useMenuPreview(employeeId: string | null) {
  return useQuery({
    queryKey: [...menuQueryKey, 'preview', employeeId],
    queryFn: () => api.get<MenuPreviewDto>(`/menu/preview?employeeId=${employeeId}`),
    enabled: employeeId !== null,
  });
}
