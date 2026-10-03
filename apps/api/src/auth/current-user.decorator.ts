import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { SessionUser } from '@fernleaf/shared';
import type { Request } from 'express';

/**
 * The signed-in staff member, for routes marked @Authenticated() or @RequirePermissions().
 * Usage: `me(@CurrentUser() user: SessionUser)`
 */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const user = context.switchToHttp().getRequest<Request>().user;
  if (!user) {
    // Only happens if a developer uses @CurrentUser() on a @Public() route.
    throw new Error('@CurrentUser() used on a route that does not require sign-in');
  }
  return user satisfies SessionUser;
});
