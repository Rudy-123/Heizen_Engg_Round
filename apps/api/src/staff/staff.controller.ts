import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import {
  createStaffSchema,
  resetPasswordSchema,
  updateStaffSchema,
  type CreateStaffInput,
  type RoleDto,
  type SessionUser,
  type StaffMemberDto,
  type UpdateStaffInput,
} from '@fernleaf/shared';
import { RequirePermissions } from '../auth/access.decorators.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { StaffService } from './staff.service.js';

@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @RequirePermissions('STAFF_MANAGE')
  @Get()
  list(): Promise<StaffMemberDto[]> {
    return this.staff.list();
  }

  @RequirePermissions('STAFF_MANAGE')
  @Get('roles')
  roles(): Promise<RoleDto[]> {
    return this.staff.roles();
  }

  @RequirePermissions('STAFF_MANAGE')
  @Post()
  create(
    @Body(new ZodValidationPipe(createStaffSchema)) body: CreateStaffInput,
  ): Promise<StaffMemberDto> {
    return this.staff.create(body);
  }

  @RequirePermissions('STAFF_MANAGE')
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateStaffSchema)) body: UpdateStaffInput,
    @CurrentUser() user: SessionUser,
  ): Promise<StaffMemberDto> {
    return this.staff.update(id, body, user);
  }

  @RequirePermissions('STAFF_MANAGE')
  @Put(':id/password')
  resetPassword(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: { password: string },
  ): Promise<StaffMemberDto> {
    return this.staff.resetPassword(id, body.password);
  }
}
