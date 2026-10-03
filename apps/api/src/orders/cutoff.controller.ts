import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { CutoffOverviewDto, CutoffRunDto, SessionUser } from '@fernleaf/shared';
import { z } from 'zod';
import { RequirePermissions } from '../auth/access.decorators.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { CutoffService } from './cutoff.service.js';

@Controller('cutoffs')
export class CutoffController {
  constructor(private readonly cutoffs: CutoffService) {}

  @RequirePermissions('CUTOFF_RUN')
  @Get()
  overview(): Promise<CutoffOverviewDto> {
    return this.cutoffs.overview();
  }

  /** "Run now" (spec 4.6): process a delivery date whose cut-off has passed, by hand. */
  @RequirePermissions('CUTOFF_RUN')
  @Post(':date/run')
  @HttpCode(200)
  run(
    @Param('date', new ZodValidationPipe(z.iso.date({ message: 'Use a date like 2026-10-07.' })))
    date: string,
    @CurrentUser() user: SessionUser,
  ): Promise<CutoffRunDto> {
    return this.cutoffs.process(date, 'MANUAL', user.id);
  }
}
