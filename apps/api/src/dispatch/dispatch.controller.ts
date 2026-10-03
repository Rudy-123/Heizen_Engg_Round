import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  assignDriverSchema,
  boardDateQuerySchema,
  deliverDropSchema,
  type AssignDriverInput,
  type BoardDateQuery,
  type DeliverDropInput,
  type DispatchBoardDto,
  type DriverDayDto,
  type DropDto,
  type SessionUser,
} from '@fernleaf/shared';
import { RequirePermissions } from '../auth/access.decorators.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { DispatchService } from './dispatch.service.js';

/** Dispatch board: DISPATCH_READ to see it, DISPATCH_MANAGE to assign drivers and move drops. */
@Controller('dispatch')
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @RequirePermissions('DISPATCH_READ')
  @Get('board')
  board(
    @Query(new ZodValidationPipe(boardDateQuerySchema)) query: BoardDateQuery,
  ): Promise<DispatchBoardDto> {
    return this.dispatch.board(query.date);
  }

  @RequirePermissions('DISPATCH_MANAGE')
  @Put('drops/:id/driver')
  assignDriver(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(assignDriverSchema)) body: AssignDriverInput,
    @CurrentUser() user: SessionUser,
  ): Promise<DropDto> {
    return this.dispatch.assignDriver(id, body, user);
  }

  @RequirePermissions('DISPATCH_MANAGE')
  @Post('drops/:id/dispatch-ready')
  @HttpCode(200)
  dispatchReady(@Param('id') id: string, @CurrentUser() user: SessionUser): Promise<DropDto> {
    return this.dispatch.markDispatchReady(id, user);
  }

  @RequirePermissions('DISPATCH_MANAGE')
  @Post('drops/:id/out-for-delivery')
  @HttpCode(200)
  outForDelivery(@Param('id') id: string, @CurrentUser() user: SessionUser): Promise<DropDto> {
    return this.dispatch.markOutForDelivery(id, user);
  }

  /** Marking any drop delivered (not just your own) is an admin's override. */
  @RequirePermissions('DELIVERIES_ANY')
  @Post('drops/:id/deliver')
  @HttpCode(200)
  deliver(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(deliverDropSchema)) body: DeliverDropInput,
    @CurrentUser() user: SessionUser,
  ): Promise<DropDto> {
    return this.dispatch.deliver(id, body, user, null);
  }

  @RequirePermissions('DISPATCH_READ')
  @Get('drops/:id/photo')
  async photo(@Param('id') id: string): Promise<StreamableFile> {
    const photo = await this.dispatch.photo(id);
    return new StreamableFile(photo.data, {
      type: photo.mimeType,
      disposition: 'inline',
    });
  }
}

/** The driver's own view (spec 4.8): their drops for today, and marking them delivered. */
@Controller('driver')
export class DriverController {
  constructor(private readonly dispatch: DispatchService) {}

  @RequirePermissions('DELIVERIES_OWN')
  @Get('today')
  today(@CurrentUser() user: SessionUser): Promise<DriverDayDto> {
    return this.dispatch.driverDay(user.id);
  }

  @RequirePermissions('DELIVERIES_OWN')
  @Post('drops/:id/deliver')
  @HttpCode(200)
  deliver(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(deliverDropSchema)) body: DeliverDropInput,
    @CurrentUser() user: SessionUser,
  ): Promise<DropDto> {
    return this.dispatch.deliver(id, body, user, user.id);
  }
}
