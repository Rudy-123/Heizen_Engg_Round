'use client';

import type {
  CompanyDetailDto,
  CompanySummaryDto,
  DriverOptionDto,
  EmployeeDto,
  Page,
} from '@fernleaf/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './api';

export const companiesQueryKey = ['companies'] as const;
export const companyQueryKey = (id: string) => [...companiesQueryKey, 'detail', id] as const;
export const employeesQueryKey = ['employees'] as const;

export function useCompanies(search = '', status: 'active' | 'inactive' | 'all' = 'all') {
  const params = new URLSearchParams({ status, ...(search ? { search } : {}) });
  return useQuery({
    queryKey: [...companiesQueryKey, 'list', { search, status }],
    queryFn: () => api.get<CompanySummaryDto[]>(`/companies?${params.toString()}`),
  });
}

export function useCompany(id: string) {
  return useQuery({
    queryKey: companyQueryKey(id),
    queryFn: () => api.get<CompanyDetailDto>(`/companies/${id}`),
  });
}

export function useDriverOptions() {
  return useQuery({
    queryKey: [...companiesQueryKey, 'drivers'],
    queryFn: () => api.get<DriverOptionDto[]>('/companies/driver-options'),
    staleTime: 60_000,
  });
}

export interface EmployeeFilter {
  companyId?: string;
  search?: string;
  status?: 'active' | 'inactive' | 'all';
  page?: number;
  pageSize?: number;
}

/** One page of employees; the previous page stays on screen while the next one loads. */
export function useEmployees(filter: EmployeeFilter, enabled = true) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return useQuery({
    queryKey: [...employeesQueryKey, filter],
    queryFn: () => api.get<Page<EmployeeDto>>(`/employees?${params.toString()}`),
    placeholderData: keepPreviousData,
    enabled,
  });
}
