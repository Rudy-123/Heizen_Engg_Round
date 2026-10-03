'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell/app-shell';
import { FullPageError, FullPageLoader } from '@/components/full-page-state';
import { ApiError } from '@/lib/api';
import { CurrentUserProvider, useSessionQuery } from '@/lib/session';

/**
 * Every signed-in page lives under this layout. It asks the API who is signed in and only
 * then renders the page, so pages can always rely on useCurrentUser().
 * A 401 (no or expired session) is redirected to /login by the global handler in providers.tsx.
 */
export default function SignedInLayout({ children }: { children: ReactNode }) {
  const session = useSessionQuery();

  if (session.data) {
    return (
      <CurrentUserProvider user={session.data}>
        <AppShell>{children}</AppShell>
      </CurrentUserProvider>
    );
  }

  const signedOut = session.error instanceof ApiError && session.error.status === 401;
  if (session.isError && !signedOut) {
    return <FullPageError message={session.error.message} onRetry={() => void session.refetch()} />;
  }
  return <FullPageLoader label={signedOut ? 'Taking you to sign in…' : 'Loading…'} />;
}
