'use client';

import type {
  CutoffOverviewDto,
  OrderDetailDto,
  OrderFormContextDto,
  OrderSummaryDto,
  Page,
} from '@fernleaf/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './api';

export const ordersQueryKey = ['orders'] as const;
export const orderQueryKey = (id: string) => [...ordersQueryKey, 'detail', id] as const;
export const cutoffsQueryKey = ['cutoffs'] as const;

export interface OrderFilter {
  from?: string;
  to?: string;
  status?: string[];
  companyId?: string;
  invoiced?: 'yes' | 'no' | 'all';
  search?: string;
  page: number;
  pageSize: number;
}

/** One page of orders; the previous page stays on screen while the next one loads. */
export function useOrders(filter: OrderFilter) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(','));
    } else if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }
  return useQuery({
    queryKey: [...ordersQueryKey, 'list', filter],
    queryFn: () => api.get<Page<OrderSummaryDto>>(`/orders?${params.toString()}`),
    placeholderData: keepPreviousData,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: orderQueryKey(id),
    queryFn: () => api.get<OrderDetailDto>(`/orders/${id}`),
  });
}

/** Menu, delivery dates, addresses and defaults for ordering on behalf of one employee. */
export function useOrderFormContext(employeeId: string | null) {
  return useQuery({
    queryKey: [...ordersQueryKey, 'form-context', employeeId],
    queryFn: () => api.get<OrderFormContextDto>(`/orders/form-context?employeeId=${employeeId}`),
    enabled: employeeId !== null,
  });
}

export function useCutoffs() {
  return useQuery({
    queryKey: cutoffsQueryKey,
    queryFn: () => api.get<CutoffOverviewDto>('/cutoffs'),
    refetchInterval: 60_000,
  });
}
