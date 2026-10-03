import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { loginSchema, type LoginInput, type SessionUser } from '@fernleaf/shared';
import type { Response } from 'express';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { Authenticated, Public } from './access.decorators.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { LoginThrottlerGuard } from './login-throttler.guard.js';
import { SESSION_COOKIE, SessionService } from './session.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  /** Signs in: sets the session cookie and returns who you are. */
  @Public()
  @UseGuards(LoginThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionUser> {
    const { user, token } = await this.auth.login(body.email, body.password);
    response.cookie(SESSION_COOKIE, token, this.sessions.cookieOptions());
    return user;
  }

  /** Signs out by deleting the cookie. Public, so it also works with an expired session. */
  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response): void {
    response.clearCookie(SESSION_COOKIE, this.sessions.clearCookieOptions());
  }

  /** The signed-in staff member, their role and permissions. The web app calls this on load. */
  @Authenticated()
  @Get('me')
  me(@CurrentUser() user: SessionUser): SessionUser {
    return user;
  }
}
