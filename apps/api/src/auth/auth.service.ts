import { Injectable } from '@nestjs/common';
import type { SessionUser } from '@fernleaf/shared';
import bcrypt from 'bcryptjs';
import { UnauthenticatedError } from '../common/errors/domain-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SessionService } from './session.service.js';
import { toSessionUser } from './session-user.js';

/**
 * Compared against when the email doesn't exist, so a wrong email takes as long as a
 * wrong password and response times don't reveal which emails have accounts.
 */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('not-a-real-password', 10);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  /** Checks the credentials and starts a session. `email` is already lower-cased by the schema. */
  async login(email: string, password: string): Promise<{ user: SessionUser; token: string }> {
    const user = await this.prisma.user.findUnique({ where: { email }, include: { role: true } });

    const passwordMatches = await bcrypt.compare(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    // One message for every failure, so the response doesn't reveal whether the
    // email exists, the account is inactive, or only the password was wrong.
    if (!user || !user.passwordHash || !user.isActive || !passwordMatches) {
      throw new UnauthenticatedError('Email or password is incorrect.');
    }

    return { user: toSessionUser(user), token: await this.sessions.issue(user.id) };
  }
}
