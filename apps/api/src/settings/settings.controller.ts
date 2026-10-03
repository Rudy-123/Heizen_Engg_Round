import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  createKitchenHolidaySchema,
  cutoffPreviewQuerySchema,
  updateSettingsSchema,
  type CreateKitchenHolidayInput,
  type CutoffPreviewDay,
  type KitchenHolidayDto,
  type PlatformSettingsDto,
  type UpdateSettingsInput,
} from '@fernleaf/shared';
import type { z } from 'zod';
import { RequirePermissions } from '../auth/access.decorators.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { SettingsService } from './settings.service.js';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @RequirePermissions('SETTINGS_READ')
  @Get()
  get(): Promise<PlatformSettingsDto> {
    return this.settings.getSettings();
  }

  @RequirePermissions('SETTINGS_WRITE')
  @Put()
  update(
    @Body(new ZodValidationPipe(updateSettingsSchema)) body: UpdateSettingsInput,
  ): Promise<PlatformSettingsDto> {
    return this.settings.updateSettings(body);
  }

  @RequirePermissions('SETTINGS_WRITE')
  @Post('kitchen-holidays')
  addHoliday(
    @Body(new ZodValidationPipe(createKitchenHolidaySchema)) body: CreateKitchenHolidayInput,
  ): Promise<KitchenHolidayDto> {
    return this.settings.addKitchenHoliday(body);
  }

  @RequirePermissions('SETTINGS_WRITE')
  @Delete('kitchen-holidays/:id')
  @HttpCode(204)
  removeHoliday(@Param('id') id: string): Promise<void> {
    return this.settings.removeKitchenHoliday(id);
  }

  /** Upcoming delivery dates and when their orders lock, under the current settings. */
  @RequirePermissions('SETTINGS_READ')
  @Get('cutoff-preview')
  cutoffPreview(
    @Query(new ZodValidationPipe(cutoffPreviewQuerySchema))
    query: z.infer<typeof cutoffPreviewQuerySchema>,
  ): Promise<CutoffPreviewDay[]> {
    return this.settings.cutoffPreview(query.days);
  }
}
