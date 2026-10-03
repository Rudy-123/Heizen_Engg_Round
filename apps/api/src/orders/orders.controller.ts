import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  createOrderSchema,
  deliveryOverrideSchema,
  orderListQuerySchema,
  orderReasonSchema,
  orderVersionSchema,
  quoteOrderSchema,
  updateOrderSchema,
  type CreateOrderInput,
  type DeliveryOverrideInput,
  type OrderDetailDto,
  type OrderFormContextDto,
  type OrderListQuery,
  type OrderQuoteDto,
  type OrderSummaryDto,
  type Page,
  type QuoteOrderInput,
  type SessionUser,
  type UpdateOrderInput,
} from '@fernleaf/shared';
import { z } from 'zod';
import { RequirePermissions } from '../auth/access.decorators.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { OrdersService } from './orders.service.js';

const employeeQuery = z.object({ employeeId: z.string().min(1, { message: 'Pick an employee.' }) });

/**
 * Orders. Reading needs ORDERS_READ; making and changing orders ORDERS_WRITE. Changes after
 * the cut-off and to confirmed orders also need ORDERS_OVERRIDE - checked in the service,
 * because whether an order is locked depends on its date and the clock.
 */
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @RequirePermissions('ORDERS_READ')
  @Get()
  list(
    @Query(new ZodValidationPipe(orderListQuerySchema)) query: OrderListQuery,
  ): Promise<Page<OrderSummaryDto>> {
    return this.orders.list(query);
  }

  @RequirePermissions('ORDERS_WRITE')
  @Get('form-context')
  formContext(
    @Query(new ZodValidationPipe(employeeQuery)) query: { employeeId: string },
  ): Promise<OrderFormContextDto> {
    return this.orders.formContext(query.employeeId);
  }

  @RequirePermissions('ORDERS_WRITE')
  @Post('quote')
  @HttpCode(200)
  quote(
    @Body(new ZodValidationPipe(quoteOrderSchema)) body: QuoteOrderInput,
  ): Promise<OrderQuoteDto> {
    return this.orders.quote(body);
  }

  @RequirePermissions('ORDERS_READ')
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: SessionUser): Promise<OrderDetailDto> {
    return this.orders.get(id, user);
  }

  @RequirePermissions('ORDERS_WRITE')
  @Post()
  create(
    @Body(new ZodValidationPipe(createOrderSchema)) body: CreateOrderInput,
    @CurrentUser() user: SessionUser,
  ): Promise<OrderDetailDto> {
    return this.orders.create(body, user);
  }

  @RequirePermissions('ORDERS_WRITE')
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateOrderSchema)) body: UpdateOrderInput,
    @CurrentUser() user: SessionUser,
  ): Promise<OrderDetailDto> {
    return this.orders.update(id, body, user);
  }

  @RequirePermissions('ORDERS_WRITE')
  @Post(':id/place')
  @HttpCode(200)
  place(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(orderVersionSchema)) body: { version: number },
    @CurrentUser() user: SessionUser,
  ): Promise<OrderDetailDto> {
    return this.orders.place(id, body.version, user);
  }

  @RequirePermissions('ORDERS_WRITE')
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(orderReasonSchema)) body: { version: number; reason: string },
    @CurrentUser() user: SessionUser,
  ): Promise<OrderDetailDto> {
    return this.orders.cancel(id, body.version, body.reason, user);
  }

  @RequirePermissions('ORDERS_OVERRIDE')
  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(orderReasonSchema)) body: { version: number; reason: string },
    @CurrentUser() user: SessionUser,
  ): Promise<OrderDetailDto> {
    return this.orders.reject(id, body.version, body.reason, user);
  }

  @RequirePermissions('ORDERS_OVERRIDE')
  @Put(':id/delivery')
  changeDelivery(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(deliveryOverrideSchema)) body: DeliveryOverrideInput,
    @CurrentUser() user: SessionUser,
  ): Promise<OrderDetailDto> {
    return this.orders.changeDelivery(id, body, user);
  }
}
