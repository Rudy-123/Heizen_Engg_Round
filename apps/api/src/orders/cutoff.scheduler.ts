import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CutoffService } from './cutoff.service.js';

const EVERY_FIVE_MINUTES = 5 * 60_000;

/**
 * Runs cut-off processing automatically: shortly after the API starts (the free host sleeps
 * when idle, so this catches up on anything missed) and then every 5 minutes. The
 * "Process cut-offs automatically" setting can pause it; "Run now" always works.
 */
@Injectable()
export class CutoffScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CutoffScheduler.name);
  private timers: NodeJS.Timeout[] = [];
  private running = false;

  constructor(
    private readonly cutoffs: CutoffService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    // Tests trigger processing themselves, at the moment they choose.
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    this.timers = [
      setTimeout(() => void this.tick(), 15_000).unref(),
      setInterval(() => void this.tick(), EVERY_FIVE_MINUTES).unref(),
    ];
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) clearTimeout(timer);
  }

  async tick(): Promise<void> {
    if (this.running) return; // the previous tick is still working
    this.running = true;
    try {
      const settings = await this.prisma.platformSettings.findUniqueOrThrow({ where: { id: 1 } });
      if (!settings.autoCutoffProcessing) return;
      for (const run of await this.cutoffs.processDue()) {
        this.logger.log(
          `Cut-off for ${run.deliveryDate}: ${run.confirmedCount} confirmed, ${run.cancelledCount} drafts cancelled.`,
        );
      }
    } catch (error) {
      this.logger.error('Automatic cut-off processing failed', error as Error);
    } finally {
      this.running = false;
    }
  }
}
