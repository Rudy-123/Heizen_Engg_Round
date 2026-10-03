'use client';

import type { HealthResponse } from '@fernleaf/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from './api';

/** The kitchen's time zone, as configured on the server (never the browser's zone). */
export function useKitchenTimeZone(): string | undefined {
  const { data } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<HealthResponse>('/health'),
    staleTime: Infinity,
  });
  return data?.kitchen.timeZone;
}

/** Today's date in the kitchen (YYYY-MM-DD), as the server sees it - never the browser's date. */
export function useKitchenToday(): string | undefined {
  const { data } = useQuery({
    queryKey: ['health', 'today'],
    queryFn: () => api.get<HealthResponse>('/health'),
    staleTime: 60_000,
  });
  return data?.kitchen.today;
}

/**
 * Current kitchen date and time for the header, e.g. "Sat 3 Oct, 11:52 IST".
 * Formatted in the kitchen's zone, so a reviewer abroad still sees the kitchen's day.
 */
export function useKitchenClockLabel(): string | null {
  const timeZone = useKitchenTimeZone();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);

  if (!timeZone) return null;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).format(now);
}
