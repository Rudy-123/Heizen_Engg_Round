import { Module } from '@nestjs/common';
import { MenuModule } from '../menu/menu.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { CutoffController } from './cutoff.controller.js';
import { CutoffScheduler } from './cutoff.scheduler.js';
import { CutoffService } from './cutoff.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

/** Spec 4.6: orders, and cut-off processing (which confirms and cancels them). */
@Module({
  imports: [MenuModule, SettingsModule],
  controllers: [OrdersController, CutoffController],
  providers: [OrdersService, CutoffService, CutoffScheduler],
  exports: [OrdersService, CutoffService],
})
export class OrdersModule {}
