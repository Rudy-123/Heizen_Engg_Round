import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SESSION_COOKIE_NAME, type SessionUser } from '@fernleaf/shared';
import type { CookieOptions, Request } from 'express';
import { UnauthenticatedError } from '../common/errors/domain-error.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toSessionUser } from './session-user.js';

export const SESSION_COOKIE = SESSION_COOKIE_NAME;

interface SessionTokenPayload {
  /** The staff member's id. Nothing else goes in the token. */
  sub: string;
}

/**
 * Sessions are a signed token (JWT) in an httpOnly cookie:
 * - httpOnly: page scripts can't read it, so an XSS bug can't steal it;
 * - SameSite=Lax: browsers don't send it on cross-site POSTs, which blocks CSRF;
 * - Secure in production: only sent over HTTPS.
 *
 * The token only holds the user id. Role and permissions are loaded fresh on every request,
 * so changing someone's role or deactivating them takes effect immediately.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  issue(userId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId } satisfies SessionTokenPayload);
  }

  /** Who is making this request? Throws 401 if nobody valid is signed in. */
  async authenticate(request: Request): Promise<SessionUser> {
    const token: unknown = request.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token === '') {
      throw new UnauthenticatedError('Please sign in.');
    }

    let payload: SessionTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<SessionTokenPayload>(token);
    } catch {
      throw new UnauthenticatedError('Your session has expired. Please sign in again.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthenticatedError('Your account is no longer active.');
    }
    return toSessionUser(user);
  }

  cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      path: '/',
      maxAge: this.config.get('SESSION_TTL_HOURS', { infer: true }) * 60 * 60 * 1000,
    };
  }

  /** Same cookie attributes without the lifetime - what the browser needs to delete it. */
  clearCookieOptions(): CookieOptions {
    const { maxAge: _maxAge, ...options } = this.cookieOptions();
    return options;
  }
}
