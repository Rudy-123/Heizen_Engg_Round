import { Module } from '@nestjs/common';
import { PricingController } from './pricing.controller.js';
import { PricingService } from './pricing.service.js';

/** Spec 4.3: price tiers, derived prices and typed overrides. */
@Module({
  controllers: [PricingController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
