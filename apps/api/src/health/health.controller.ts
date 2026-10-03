import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@fernleaf/shared';
import { Public } from '../auth/access.decorators.js';
import { ClockService } from '../common/clock/clock.service.js';
import { DomainError } from '../common/errors/domain-error.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly clock: ClockService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Cheap liveness check, used by Render and by the keep-alive pinger.
   * It deliberately doesn't touch the database, so pings don't keep the database busy.
   * It also shows the kitchen's "today", which makes time-zone problems easy to spot after a deploy.
   */
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      time: this.clock.now().toISOString(),
      kitchen: {
        timeZone: this.clock.kitchenTimeZone,
        today: this.clock.kitchenToday(),
        localTime: this.clock.kitchenNow().toFormat('HH:mm'),
      },
    };
  }

  /** Readiness check: can we actually reach the database? Used to verify a deploy. */
  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new DomainError(503, 'DATABASE_UNAVAILABLE', 'The database is not reachable.');
    }
    return { status: 'ok', database: 'ok' };
  }
}
