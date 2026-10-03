import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ForbiddenError } from '../common/errors/domain-error.js';
import { ACCESS_RULE, type AccessRule } from './access.decorators.js';
import { SessionService } from './session.service.js';

/**
 * The single place that decides whether a request may reach a route. Registered globally,
 * so it runs for every endpoint (spec §3: "permissions must be enforced on the server").
 *
 *   1. No access rule on the route      -> 403 (deny by default)
 *   2. @Public()                         -> allowed
 *   3. Not signed in / session invalid   -> 401
 *   4. @Authenticated()                  -> allowed
 *   5. @RequirePermissions(...)          -> allowed only if the role has all of them, else 403
 *
 * It checks permissions, never role names, so a new role needs no code changes.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_RULE, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!rule) {
      throw new ForbiddenError(
        'This endpoint has no access rule, so it is closed.',
        'ACCESS_RULE_MISSING',
      );
    }
    if (rule.kind === 'public') return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = await this.sessions.authenticate(request);
    request.user = user;

    if (rule.kind === 'authenticated') return true;

    const missing = rule.permissions.filter((permission) => !user.permissions.includes(permission));
    if (missing.length > 0) {
      throw new ForbiddenError(
        `Your role (${user.role.name}) doesn't allow this action. Missing: ${missing.join(', ')}.`,
      );
    }
    return true;
  }
}
