import { Controller, Get } from '@nestjs/common';
import type { AdminDashboardDto, SessionUser } from '@fernleaf/shared';
import { RequirePermissions } from '../auth/access.decorators.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { DashboardService } from './dashboard.service.js';

/**
 * The admin dashboard. Billing and data-health sections appear only for people who may see
 * billing and pricing. (Kitchen, dispatch and driver dashboards use their board endpoints.)
 */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @RequirePermissions('ORDERS_READ')
  @Get('admin')
  admin(@CurrentUser() user: SessionUser): Promise<AdminDashboardDto> {
    return this.dashboard.admin(user.permissions);
  }
}
