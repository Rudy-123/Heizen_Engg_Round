import { Module } from '@nestjs/common';
import { CompaniesController, EmployeesController } from './companies.controllers.js';
import { CompaniesService } from './companies.service.js';
import { EmployeesService } from './employees.service.js';

/** Spec 4.4 and 4.5: companies (domains, addresses, calendar, delivery defaults) and employees. */
@Module({
  controllers: [CompaniesController, EmployeesController],
  providers: [CompaniesService, EmployeesService],
  exports: [CompaniesService, EmployeesService],
})
export class CompaniesModule {}
