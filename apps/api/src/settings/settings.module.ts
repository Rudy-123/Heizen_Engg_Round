import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';

@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
  // Orders, cut-off processing and the kitchen board all need the kitchen's rules.
  exports: [SettingsService],
})
export class SettingsModule {}
