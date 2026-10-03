'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { ApiError } from '@/lib/api';

/** If the API says the session is gone (401), send the person to sign in again. */
function redirectToLoginIfSignedOut(error: unknown): void {
  if (!(error instanceof ApiError) || error.status !== 401) return;
  if (window.location.pathname.startsWith('/login')) return;
  const next = window.location.pathname + window.location.search;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: redirectToLoginIfSignedOut }),
        mutationCache: new MutationCache({ onError: redirectToLoginIfSignedOut }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Retry network/server hiccups, but not answers like 403 or 404.
            retry: (failureCount, error) =>
              error instanceof ApiError && error.status >= 400 && error.status < 500
                ? false
                : failureCount < 2,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster richColors closeButton position="top-right" />
    </QueryClientProvider>
  );
}
