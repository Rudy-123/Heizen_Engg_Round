import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { CatalogueModule } from './catalogue/catalogue.module.js';
import { CommonModule } from './common/common.module.js';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { validateEnv } from './config/env.js';
import { CompaniesModule } from './companies/companies.module.js';
import { HealthModule } from './health/health.module.js';
import { MenuModule } from './menu/menu.module.js';
import { PricingModule } from './pricing/pricing.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SettingsModule } from './settings/settings.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      // Tests get their settings (incl. a throwaway database) from the test setup, never
      // from the developer's .env - so a test run can't touch the real database.
      ignoreEnvFile: process.env['NODE_ENV'] === 'test',
    }),
    CommonModule,
    PrismaModule,
    AuthModule,
    HealthModule,
    SettingsModule,
    CatalogueModule,
    PricingModule,
    CompaniesModule,
    MenuModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
