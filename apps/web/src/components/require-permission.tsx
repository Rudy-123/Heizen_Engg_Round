'use client';

import type { Permission } from '@fernleaf/shared';
import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { homeRouteFor, useCurrentUser } from '@/lib/session';

/**
 * Shows the page only to roles with `permission`; anyone else (e.g. someone typing the URL)
 * gets a clear "not available for your role" message. This is for the person's benefit -
 * the API refuses the underlying requests regardless.
 */
export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const user = useCurrentUser();
  if (user.permissions.includes(permission)) return children;

  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <ShieldAlert className="size-6" />
      </span>
      <h1 className="mt-4 text-lg font-semibold">Not available for your role</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your role ({user.role.name}) doesn&apos;t include access to this page. If you need it, ask
        an admin to change your role.
      </p>
      <Button asChild className="mt-6">
        <Link href={homeRouteFor(user)}>Go to my start page</Link>
      </Button>
    </div>
  );
}
