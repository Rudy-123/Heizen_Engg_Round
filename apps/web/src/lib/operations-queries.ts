'use client';

import type { DispatchBoardDto, DriverDayDto, KitchenBoardDto } from '@fernleaf/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './api';

export const kitchenBoardKey = (date: string) => ['kitchen', 'board', date] as const;
export const dispatchBoardKey = (date: string) => ['dispatch', 'board', date] as const;
export const driverDayKey = ['driver', 'today'] as const;

/** Boards poll (no websockets): fresh enough for a kitchen, and cheap. */
const BOARD_REFRESH_MS = 20_000;

export function useKitchenBoard(date: string | undefined) {
  return useQuery({
    queryKey: kitchenBoardKey(date ?? ''),
    queryFn: () => api.get<KitchenBoardDto>(`/kitchen/board?date=${date}`),
    enabled: Boolean(date),
    refetchInterval: BOARD_REFRESH_MS,
    placeholderData: keepPreviousData,
  });
}

export function useDispatchBoard(date: string | undefined) {
  return useQuery({
    queryKey: dispatchBoardKey(date ?? ''),
    queryFn: () => api.get<DispatchBoardDto>(`/dispatch/board?date=${date}`),
    enabled: Boolean(date),
    refetchInterval: BOARD_REFRESH_MS,
    placeholderData: keepPreviousData,
  });
}

export function useDriverDay() {
  return useQuery({
    queryKey: driverDayKey,
    queryFn: () => api.get<DriverDayDto>('/driver/today'),
    refetchInterval: 30_000,
  });
}
