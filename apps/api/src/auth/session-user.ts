import type { Permission as SharedPermission, SessionUser } from '@fernleaf/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { Permission as DbPermission } from '../generated/prisma/enums.js';

// Compile-time safety net: the permission list in packages/shared and the Prisma enum
// must be identical. If someone adds a permission to one and not the other, this line
// stops the build.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type PermissionListsMatch = Assert<Same<SharedPermission, DbPermission>>;

export type UserWithRole = Prisma.UserGetPayload<{ include: { role: true } }>;

/** What the API tells the web app about the signed-in person. No password hash, ever. */
export function toSessionUser(user: UserWithRole): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: {
      key: user.role.key,
      name: user.role.name,
      homeDashboard: user.role.homeDashboard,
    },
    permissions: [...user.role.permissions],
  };
}
