import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ErrorCode } from '@fernleaf/shared';
import { DomainError } from '../common/errors/domain-error.js';

/**
 * Slows down password guessing: at most 10 sign-in attempts per minute for the same
 * email from the same address. Counting per email (not only per IP) matters because
 * every request reaches us through Vercel's proxy.
 */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(request: Record<string, unknown>): Promise<string> {
    const body = request['body'] as { email?: unknown } | undefined;
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    return `${String(request['ip'])}|${email}`;
  }

  protected override async throwThrottlingException(): Promise<void> {
    throw new DomainError(
      429,
      ErrorCode.TooManyRequests,
      'Too many sign-in attempts. Please wait a minute and try again.',
    );
  }
}
