import { Module } from '@nestjs/common';
import {
  DishesController,
  OptionsController,
  ReferenceDataController,
} from './catalogue.controllers.js';
import { DishesService } from './dishes.service.js';
import { OptionsService } from './options.service.js';
import { ReferenceDataService } from './reference-data.service.js';

/** Spec 4.1: reference lists, dishes, reusable options and option groups (with portions). */
@Module({
  controllers: [ReferenceDataController, DishesController, OptionsController],
  providers: [ReferenceDataService, DishesService, OptionsService],
  exports: [DishesService],
})
export class CatalogueModule {}
