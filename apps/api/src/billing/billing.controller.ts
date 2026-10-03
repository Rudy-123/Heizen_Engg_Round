import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  createCreditSchema,
  createInvoiceSchema,
  invoiceListQuerySchema,
  type BillingOverviewDto,
  type CompanyBillingDto,
  type CreateCreditInput,
  type CreateInvoiceInput,
  type CreditDto,
  type InvoiceDetailDto,
  type InvoiceListQuery,
  type InvoiceSummaryDto,
  type Page,
  type SessionUser,
} from '@fernleaf/shared';
import { RequirePermissions } from '../auth/access.decorators.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { BillingService } from './billing.service.js';

/** Billing: BILLING_READ to see money owed and invoices; BILLING_WRITE to invoice, mark paid, credit. */
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @RequirePermissions('BILLING_READ')
  @Get('overview')
  overview(): Promise<BillingOverviewDto> {
    return this.billing.overview();
  }

  @RequirePermissions('BILLING_READ')
  @Get('companies/:id')
  company(@Param('id') id: string): Promise<CompanyBillingDto> {
    return this.billing.company(id);
  }

  @RequirePermissions('BILLING_READ')
  @Get('invoices')
  invoices(
    @Query(new ZodValidationPipe(invoiceListQuerySchema)) query: InvoiceListQuery,
  ): Promise<Page<InvoiceSummaryDto>> {
    return this.billing.listInvoices(query);
  }

  @RequirePermissions('BILLING_READ')
  @Get('invoices/:id')
  invoice(@Param('id') id: string): Promise<InvoiceDetailDto> {
    return this.billing.invoice(id);
  }

  @RequirePermissions('BILLING_WRITE')
  @Post('invoices')
  createInvoice(
    @Body(new ZodValidationPipe(createInvoiceSchema)) body: CreateInvoiceInput,
    @CurrentUser() user: SessionUser,
  ): Promise<InvoiceDetailDto> {
    return this.billing.createInvoice(body, user);
  }

  @RequirePermissions('BILLING_WRITE')
  @Post('invoices/:id/pay')
  @HttpCode(200)
  markPaid(@Param('id') id: string, @CurrentUser() user: SessionUser): Promise<InvoiceDetailDto> {
    return this.billing.markPaid(id, user);
  }

  @RequirePermissions('BILLING_WRITE')
  @Post('credits')
  createCredit(
    @Body(new ZodValidationPipe(createCreditSchema)) body: CreateCreditInput,
    @CurrentUser() user: SessionUser,
  ): Promise<CreditDto> {
    return this.billing.createCredit(body, user);
  }
}
