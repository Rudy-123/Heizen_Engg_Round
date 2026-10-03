'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { FullPageLoader } from '@/components/full-page-state';
import { homeRouteFor, useCurrentUser } from '@/lib/session';

/** "/" sends each person to their own start page (dashboard, or deliveries for drivers). */
export default function HomeRedirect() {
  const user = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    router.replace(homeRouteFor(user));
  }, [router, user]);

  return <FullPageLoader />;
}
