import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

/** Spec 4.11: the admin dashboard's figures. */
@Module({
  imports: [BillingModule, PricingModule, SettingsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
