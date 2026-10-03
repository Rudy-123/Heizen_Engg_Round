import { Global, Module } from '@nestjs/common';
import { ClockService } from './clock/clock.service.js';

/** Building blocks every feature module needs. Global, so modules don't import it one by one. */
@Global()
@Module({
  providers: [ClockService],
  exports: [ClockService],
})
export class CommonModule {}
