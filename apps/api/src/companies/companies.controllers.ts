import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  addCompanyDomainSchema,
  companyAddressInputSchema,
  companyDetailsSchema,
  companyListQuerySchema,
  createCompanySchema,
  createKitchenHolidaySchema,
  employeeInputSchema,
  employeeListQuerySchema,
  type CompanyAddressInput,
  type CompanyDetailDto,
  type CompanyDetailsInput,
  type CompanySummaryDto,
  type CreateCompanyInput,
  type CreateKitchenHolidayInput,
  type DriverOptionDto,
  type EmployeeDto,
  type EmployeeInput,
  type EmployeeListQuery,
  type Page,
} from '@fernleaf/shared';
import type { z } from 'zod';
import { RequirePermissions } from '../auth/access.decorators.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { CompaniesService } from './companies.service.js';
import { EmployeesService } from './employees.service.js';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @RequirePermissions('COMPANIES_READ')
  @Get()
  list(
    @Query(new ZodValidationPipe(companyListQuerySchema))
    query: z.infer<typeof companyListQuerySchema>,
  ): Promise<CompanySummaryDto[]> {
    return this.companies.list(query);
  }

  /** Staff who can be picked as a company's default driver. */
  @RequirePermissions('COMPANIES_READ')
  @Get('driver-options')
  driverOptions(): Promise<DriverOptionDto[]> {
    return this.companies.driverOptions();
  }

  @RequirePermissions('COMPANIES_READ')
  @Get(':id')
  get(@Param('id') id: string): Promise<CompanyDetailDto> {
    return this.companies.get(id);
  }

  @RequirePermissions('COMPANIES_WRITE')
  @Post()
  create(
    @Body(new ZodValidationPipe(createCompanySchema)) body: CreateCompanyInput,
  ): Promise<CompanyDetailDto> {
    return this.companies.create(body);
  }

  @RequirePermissions('COMPANIES_WRITE')
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(companyDetailsSchema)) body: CompanyDetailsInput,
  ): Promise<CompanyDetailDto> {
    return this.companies.update(id, body);
  }

  @RequirePermissions('COMPANIES_WRITE')
  @Post(':id/domains')
  addDomain(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addCompanyDomainSchema)) body: { domain: string },
  ): Promise<CompanyDetailDto> {
    return this.companies.addDomain(id, body.domain);
  }

  @RequirePermissions('COMPANIES_WRITE')
  @Delete(':id/domains/:domainId')
  removeDomain(
    @Param('id') id: string,
    @Param('domainId') domainId: string,
  ): Promise<CompanyDetailDto> {
    return this.companies.removeDomain(id, domainId);
  }

  @RequirePermissions('COMPANIES_WRITE')
  @Post(':id/addresses')
  addAddress(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(companyAddressInputSchema)) body: CompanyAddressInput,
  ): Promise<CompanyDetailDto> {
    return this.companies.addAddress(id, body);
  }

  @RequirePermissions('COMPANIES_WRITE')
  @Put(':id/addresses/:addressId')
  updateAddress(
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @Body(new ZodValidationPipe(companyAddressInputSchema)) body: CompanyAddressInput,
  ): Promise<CompanyDetailDto> {
    return this.companies.updateAddress(id, addressId, body);
  }

  @RequirePermissions('COMPANIES_WRITE')
  @Post(':id/addresses/:addressId/make-default')
  @HttpCode(200)
  makeDefaultAddress(
    @Param('id') id: string,
    @Param('addressId') addressId: string,
  ): Promise<CompanyDetailDto> {
    return this.companies.makeDefaultAddress(id, addressId);
  }

  @RequirePermissions('COMPANIES_WRITE')
  @Post(':id/holidays')
  addHoliday(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createKitchenHolidaySchema)) body: CreateKitchenHolidayInput,
  ): Promise<CompanyDetailDto> {
    return this.companies.addHoliday(id, body);
  }

  @RequirePermissions('COMPANIES_WRITE')
  @Delete(':id/holidays/:holidayId')
  removeHoliday(
    @Param('id') id: string,
    @Param('holidayId') holidayId: string,
  ): Promise<CompanyDetailDto> {
    return this.companies.removeHoliday(id, holidayId);
  }
}

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @RequirePermissions('EMPLOYEES_READ')
  @Get()
  list(
    @Query(new ZodValidationPipe(employeeListQuerySchema)) query: EmployeeListQuery,
  ): Promise<Page<EmployeeDto>> {
    return this.employees.list(query);
  }

  @RequirePermissions('EMPLOYEES_READ')
  @Get(':id')
  get(@Param('id') id: string): Promise<EmployeeDto> {
    return this.employees.get(id);
  }

  @RequirePermissions('EMPLOYEES_WRITE')
  @Post()
  create(
    @Body(new ZodValidationPipe(employeeInputSchema)) body: EmployeeInput,
  ): Promise<EmployeeDto> {
    return this.employees.create(body);
  }

  @RequirePermissions('EMPLOYEES_WRITE')
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(employeeInputSchema)) body: EmployeeInput,
  ): Promise<EmployeeDto> {
    return this.employees.update(id, body);
  }
}
