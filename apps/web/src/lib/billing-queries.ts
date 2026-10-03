'use client';

import type {
  BillingOverviewDto,
  CompanyBillingDto,
  InvoiceDetailDto,
  InvoiceSummaryDto,
  Page,
} from '@fernleaf/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './api';

export const billingKey = ['billing'] as const;

export function useBillingOverview() {
  return useQuery({
    queryKey: [...billingKey, 'overview'],
    queryFn: () => api.get<BillingOverviewDto>('/billing/overview'),
  });
}

export function useCompanyBilling(companyId: string) {
  return useQuery({
    queryKey: [...billingKey, 'company', companyId],
    queryFn: () => api.get<CompanyBillingDto>(`/billing/companies/${companyId}`),
  });
}

export function useInvoices(filter: { status: 'ISSUED' | 'PAID' | 'all'; page: number }) {
  return useQuery({
    queryKey: [...billingKey, 'invoices', filter],
    queryFn: () =>
      api.get<Page<InvoiceSummaryDto>>(
        `/billing/invoices?status=${filter.status}&page=${filter.page}&pageSize=20`,
      ),
    placeholderData: keepPreviousData,
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: [...billingKey, 'invoice', id],
    queryFn: () => api.get<InvoiceDetailDto>(`/billing/invoices/${id}`),
  });
}
