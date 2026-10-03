import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  priceTierInputSchema,
  tierPriceChangesSchema,
  type PriceTierDto,
  type PriceTierInput,
  type TierGridDto,
  type TierPriceChangesInput,
} from '@fernleaf/shared';
import { RequirePermissions } from '../auth/access.decorators.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { PricingService } from './pricing.service.js';

@Controller('pricing/tiers')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @RequirePermissions('PRICING_READ')
  @Get()
  list(): Promise<PriceTierDto[]> {
    return this.pricing.listTiers();
  }

  @RequirePermissions('PRICING_READ')
  @Get(':id/grid')
  grid(@Param('id') id: string): Promise<TierGridDto> {
    return this.pricing.getGrid(id);
  }

  @RequirePermissions('PRICING_WRITE')
  @Post()
  create(
    @Body(new ZodValidationPipe(priceTierInputSchema)) body: PriceTierInput,
  ): Promise<PriceTierDto> {
    return this.pricing.createTier(body);
  }

  @RequirePermissions('PRICING_WRITE')
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(priceTierInputSchema)) body: PriceTierInput,
  ): Promise<PriceTierDto> {
    return this.pricing.updateTier(id, body);
  }

  @RequirePermissions('PRICING_WRITE')
  @Post(':id/make-default')
  @HttpCode(200)
  makeDefault(@Param('id') id: string): Promise<PriceTierDto> {
    return this.pricing.makeDefault(id);
  }

  @RequirePermissions('PRICING_WRITE')
  @Put(':id/prices')
  setPrices(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(tierPriceChangesSchema)) body: TierPriceChangesInput,
  ): Promise<TierGridDto> {
    return this.pricing.setPrices(id, body);
  }
}
