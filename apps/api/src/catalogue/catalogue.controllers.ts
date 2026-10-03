import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  createReferenceItemSchema,
  dishInputSchema,
  dishListQuerySchema,
  dishOptionGroupsSchema,
  optionInputSchema,
  referenceKindSchema,
  updateReferenceItemSchema,
  type CreateReferenceItemInput,
  type DishDetailDto,
  type DishInput,
  type DishOptionGroupsInput,
  type DishSummaryDto,
  type OptionDto,
  type OptionInput,
  type ReferenceDataDto,
  type ReferenceItemDto,
  type ReferenceKind,
  type SessionUser,
  type UpdateReferenceItemInput,
} from '@fernleaf/shared';
import type { z } from 'zod';
import { Authenticated, RequirePermissions } from '../auth/access.decorators.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { DishesService } from './dishes.service.js';
import { OptionsService } from './options.service.js';
import { ReferenceDataService } from './reference-data.service.js';

/** Costs are commercial data: only roles that can see pricing get them. */
function canSeeCosts(user: SessionUser): boolean {
  return user.permissions.includes('PRICING_READ');
}

@Controller('reference')
export class ReferenceDataController {
  constructor(private readonly referenceData: ReferenceDataService) {}

  /** Any signed-in staff member may read the lists (they fill pickers across the app). */
  @Authenticated()
  @Get()
  getAll(): Promise<ReferenceDataDto> {
    return this.referenceData.getAll();
  }

  @RequirePermissions('CATALOGUE_WRITE')
  @Post(':kind')
  create(
    @Param('kind', new ZodValidationPipe(referenceKindSchema)) kind: ReferenceKind,
    @Body(new ZodValidationPipe(createReferenceItemSchema)) body: CreateReferenceItemInput,
  ): Promise<ReferenceItemDto> {
    return this.referenceData.create(kind, body);
  }

  @RequirePermissions('CATALOGUE_WRITE')
  @Patch(':kind/:id')
  update(
    @Param('kind', new ZodValidationPipe(referenceKindSchema)) kind: ReferenceKind,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateReferenceItemSchema)) body: UpdateReferenceItemInput,
  ): Promise<ReferenceItemDto> {
    return this.referenceData.update(kind, id, body);
  }
}

@Controller('dishes')
export class DishesController {
  constructor(private readonly dishes: DishesService) {}

  @RequirePermissions('CATALOGUE_READ')
  @Get()
  list(
    @Query(new ZodValidationPipe(dishListQuerySchema)) query: z.infer<typeof dishListQuerySchema>,
    @CurrentUser() user: SessionUser,
  ): Promise<DishSummaryDto[]> {
    return this.dishes.list(query, canSeeCosts(user));
  }

  @RequirePermissions('CATALOGUE_READ')
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: SessionUser): Promise<DishDetailDto> {
    return this.dishes.get(id, canSeeCosts(user));
  }

  @RequirePermissions('CATALOGUE_WRITE')
  @Post()
  create(@Body(new ZodValidationPipe(dishInputSchema)) body: DishInput): Promise<DishDetailDto> {
    return this.dishes.create(body);
  }

  @RequirePermissions('CATALOGUE_WRITE')
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(dishInputSchema)) body: DishInput,
  ): Promise<DishDetailDto> {
    return this.dishes.update(id, body);
  }

  @RequirePermissions('CATALOGUE_WRITE')
  @Put(':id/option-groups')
  replaceOptionGroups(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(dishOptionGroupsSchema)) body: DishOptionGroupsInput,
  ): Promise<DishDetailDto> {
    return this.dishes.replaceOptionGroups(id, body);
  }
}

@Controller('options')
export class OptionsController {
  constructor(private readonly options: OptionsService) {}

  @RequirePermissions('CATALOGUE_READ')
  @Get()
  list(@CurrentUser() user: SessionUser): Promise<OptionDto[]> {
    return this.options.list(canSeeCosts(user));
  }

  @RequirePermissions('CATALOGUE_WRITE')
  @Post()
  create(@Body(new ZodValidationPipe(optionInputSchema)) body: OptionInput): Promise<OptionDto> {
    return this.options.create(body);
  }

  @RequirePermissions('CATALOGUE_WRITE')
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(optionInputSchema)) body: OptionInput,
  ): Promise<OptionDto> {
    return this.options.update(id, body);
  }
}
