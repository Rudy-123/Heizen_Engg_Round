import { Module } from '@nestjs/common';
import { KitchenController } from './kitchen.controller.js';
import { KitchenService } from './kitchen.service.js';

/** Spec 4.7: the kitchen board and prep units. */
@Module({
  controllers: [KitchenController],
  providers: [KitchenService],
})
export class KitchenModule {}
