import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@fernleaf/shared';

/**
 * Every route must say who may call it, using exactly one of these decorators.
 * A route without one is closed to everybody (AccessGuard denies by default), so
 * forgetting a decorator can never accidentally open an endpoint.
 */
export const ACCESS_RULE = 'fernleaf:access-rule';

export type AccessRule =
  | { kind: 'public' }
  | { kind: 'authenticated' }
  | { kind: 'permissions'; permissions: Permission[] };

/** Anyone, signed in or not (health checks, sign-in itself). */
export const Public = () => SetMetadata(ACCESS_RULE, { kind: 'public' } satisfies AccessRule);

/** Any signed-in staff member, whatever their role (e.g. "who am I?"). */
export const Authenticated = () =>
  SetMetadata(ACCESS_RULE, { kind: 'authenticated' } satisfies AccessRule);

/** Signed in AND the person's role has every listed permission. */
export const RequirePermissions = (...permissions: [Permission, ...Permission[]]) =>
  SetMetadata(ACCESS_RULE, { kind: 'permissions', permissions } satisfies AccessRule);
