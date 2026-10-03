import { Module } from '@nestjs/common';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';

/** Spec §3: admins create staff accounts and assign each one exactly one role. */
@Module({
  controllers: [StaffController],
  providers: [StaffService],
})
export class StaffModule {}
