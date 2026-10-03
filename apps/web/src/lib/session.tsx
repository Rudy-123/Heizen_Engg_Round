'use client';

import type { LoginInput, Permission, SessionUser } from '@fernleaf/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, useContext, type ReactNode } from 'react';
import { api } from './api';

export const sessionQueryKey = ['session'] as const;

/** Who is signed in, according to the API (GET /api/auth/me). */
export function useSessionQuery() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: () => api.get<SessionUser>('/auth/me'),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

/** Where a person lands after signing in: drivers get their delivery list, everyone else a dashboard. */
export function homeRouteFor(user: SessionUser): string {
  return user.role.homeDashboard === 'DRIVER' ? '/driver' : '/dashboard';
}

export function hasPermission(user: SessionUser, permission: Permission): boolean {
  return user.permissions.includes(permission);
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api.post<SessionUser>('/auth/login', input),
    onSuccess: (user) => queryClient.setQueryData(sessionQueryKey, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout'),
    onSettled: () => {
      queryClient.clear();
      router.replace('/login');
    },
  });
}

// The signed-in user for everything inside the app shell. The shell only renders its
// children once /auth/me has answered, so inside it the user is always known.
const CurrentUserContext = createContext<SessionUser | null>(null);

export function CurrentUserProvider({
  user,
  children,
}: {
  user: SessionUser;
  children: ReactNode;
}) {
  return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser(): SessionUser {
  const user = useContext(CurrentUserContext);
  if (!user) throw new Error('useCurrentUser() must be used inside the signed-in app shell');
  return user;
}

/** UI-only check for showing or hiding things. The API enforces the real rule. */
export function useCan(permission: Permission): boolean {
  return hasPermission(useCurrentUser(), permission);
}
