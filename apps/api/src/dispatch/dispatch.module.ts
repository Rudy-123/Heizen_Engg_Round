import { Module } from '@nestjs/common';
import { DispatchController, DriverController } from './dispatch.controller.js';
import { DispatchService } from './dispatch.service.js';

/** Spec 4.8: drops, the dispatch board and the driver's view. */
@Module({
  controllers: [DispatchController, DriverController],
  providers: [DispatchService],
  exports: [DispatchService],
})
export class DispatchModule {}
