'use client';

import {
  bpsToMultiplierString,
  bpsToPercentChange,
  type PriceTierDto,
  type TierGridDto,
} from '@fernleaf/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/** Prefix of every pricing query: a price change can move prices on several tiers at once. */
export const pricingQueryKey = ['pricing'] as const;
export const tiersQueryKey = [...pricingQueryKey, 'tiers'] as const;
export const tierGridQueryKey = (id: string) => [...pricingQueryKey, 'grid', id] as const;

export function useTiers() {
  return useQuery({
    queryKey: tiersQueryKey,
    queryFn: () => api.get<PriceTierDto[]>('/pricing/tiers'),
  });
}

export function useTierGrid(id: string) {
  return useQuery({
    queryKey: tierGridQueryKey(id),
    queryFn: () => api.get<TierGridDto>(`/pricing/tiers/${id}/grid`),
  });
}

/** "Typed in by hand" · "Cost × 2.4" · "Standard +15%" */
export function describeRule(
  tier: Pick<PriceTierDto, 'ruleBasis' | 'baseTier' | 'multiplierBps'>,
): string {
  const multiplier = tier.multiplierBps ?? 10_000;
  switch (tier.ruleBasis) {
    case 'NONE':
      return 'Typed in by hand';
    case 'COST':
      return `Cost × ${bpsToMultiplierString(multiplier)}`;
    case 'TIER':
      return `${tier.baseTier?.name ?? 'Another tier'} ${bpsToPercentChange(multiplier)}`;
  }
}
