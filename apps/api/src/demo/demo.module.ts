import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { DispatchModule } from '../dispatch/dispatch.module.js';
import { KitchenModule } from '../kitchen/kitchen.module.js';
import { MenuModule } from '../menu/menu.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { DemoScheduler } from './demo.scheduler.js';
import { DemoService } from './demo.service.js';

/** The demo kitchen's simulated days (DEMO_MODE=true). */
@Module({
  imports: [OrdersModule, KitchenModule, DispatchModule, BillingModule, MenuModule, SettingsModule],
  providers: [DemoService, DemoScheduler],
  exports: [DemoService],
})
export class DemoModule {}
