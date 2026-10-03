import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  boardDateQuerySchema,
  type BoardDateQuery,
  type KitchenBoardDto,
  type KitchenOrderDto,
  type SessionUser,
} from '@fernleaf/shared';
import { RequirePermissions } from '../auth/access.decorators.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { KitchenService } from './kitchen.service.js';

/** Kitchen board: anyone with KITCHEN_READ sees it; KITCHEN_WORK marks units started and done. */
@Controller('kitchen')
export class KitchenController {
  constructor(private readonly kitchen: KitchenService) {}

  @RequirePermissions('KITCHEN_READ')
  @Get('board')
  board(
    @Query(new ZodValidationPipe(boardDateQuerySchema)) query: BoardDateQuery,
  ): Promise<KitchenBoardDto> {
    return this.kitchen.board(query.date);
  }

  @RequirePermissions('KITCHEN_WORK')
  @Post('units/:id/start')
  @HttpCode(200)
  start(@Param('id') id: string, @CurrentUser() user: SessionUser): Promise<KitchenOrderDto> {
    return this.kitchen.start(id, user);
  }

  @RequirePermissions('KITCHEN_WORK')
  @Post('units/:id/done')
  @HttpCode(200)
  done(@Param('id') id: string, @CurrentUser() user: SessionUser): Promise<KitchenOrderDto> {
    return this.kitchen.done(id, user);
  }

  @RequirePermissions('KITCHEN_FORCE_COMPLETE')
  @Post('orders/:id/force-complete')
  @HttpCode(200)
  forceComplete(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<KitchenOrderDto> {
    return this.kitchen.forceComplete(id, user);
  }
}
