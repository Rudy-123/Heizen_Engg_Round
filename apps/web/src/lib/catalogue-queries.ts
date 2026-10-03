'use client';

import type { DishSummaryDto, OptionDto, ReferenceDataDto } from '@fernleaf/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export const referenceQueryKey = ['reference'] as const;
export const optionsQueryKey = ['options'] as const;
export const dishesQueryKey = ['dishes'] as const;

/** All reference lists (allergens, tags, stations, sizes, packaging) in one request. */
export function useReferenceData() {
  return useQuery({
    queryKey: referenceQueryKey,
    queryFn: () => api.get<ReferenceDataDto>('/reference'),
    staleTime: 60_000,
  });
}

export function useOptions() {
  return useQuery({ queryKey: optionsQueryKey, queryFn: () => api.get<OptionDto[]>('/options') });
}

export function useDishes(search: string, status: 'active' | 'inactive' | 'all') {
  const params = new URLSearchParams({ status, ...(search ? { search } : {}) });
  return useQuery({
    queryKey: [...dishesQueryKey, { search, status }],
    queryFn: () => api.get<DishSummaryDto[]>(`/dishes?${params.toString()}`),
  });
}

/** Native <select> styled like our inputs. */
export const selectClassName =
  'h-9 w-full rounded-lg border border-input bg-card px-2 text-sm shadow-xs outline-none focus-visible:border-primary/50 focus-visible:ring-[3px] focus-visible:ring-primary/15 disabled:opacity-50';
