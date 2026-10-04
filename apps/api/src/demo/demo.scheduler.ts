import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { DemoService } from './demo.service.js';

const EVERY_TEN_MINUTES = 10 * 60_000;

/**
 * With DEMO_MODE=true, runs the demo simulation shortly after the API starts (the free host
 * sleeps when idle, so this also catches up on missed time) and every 10 minutes after that.
 */
@Injectable()
export class DemoScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DemoScheduler.name);
  private timers: NodeJS.Timeout[] = [];
  private running = false;

  constructor(
    private readonly demo: DemoService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('DEMO_MODE', { infer: true })) return;
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    this.timers = [
      setTimeout(() => void this.tick(), 30_000).unref(),
      setInterval(() => void this.tick(), EVERY_TEN_MINUTES).unref(),
    ];
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) clearTimeout(timer);
  }

  async tick(): Promise<void> {
    if (this.running) return; // the first run after a deploy can take a few minutes
    this.running = true;
    try {
      const report = await this.demo.run();
      this.logger.log(`Demo data: ${JSON.stringify(report)}`);
    } catch (error) {
      this.logger.error('Demo simulation failed', error as Error);
    } finally {
      this.running = false;
    }
  }
}
