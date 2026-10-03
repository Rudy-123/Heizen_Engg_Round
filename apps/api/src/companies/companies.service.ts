import { Injectable } from '@nestjs/common';
import type {
  CompanyAddressInput,
  CompanyDetailDto,
  CompanyDetailsInput,
  CompanySummaryDto,
  CreateCompanyInput,
  CreateKitchenHolidayInput,
  DriverOptionDto,
  FieldError,
} from '@fernleaf/shared';
import type { z } from 'zod';
import type { companyListQuerySchema } from '@fernleaf/shared';
import { dbDateToIso, isoDateToDb } from '../common/dates.js';
import { BusinessRuleError, ConflictError, NotFoundError } from '../common/errors/domain-error.js';
import { isUniqueViolation } from '../common/errors/prisma-errors.js';
import { deliveryTimeProblem } from '../domain/delivery-slots.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const detailInclude = {
  domains: { orderBy: { domain: 'asc' } },
  addresses: { orderBy: [{ isDefault: 'desc' }, { label: 'asc' }] },
  holidays: { orderBy: { date: 'asc' } },
  owner: true,
  priceTier: { select: { id: true, name: true } },
  hiddenCategories: { select: { categoryId: true } },
  hiddenMenuItems: { select: { menuItemId: true } },
  _count: { select: { employees: { where: { isActive: true } } } },
} satisfies Prisma.CompanyInclude;

type CompanyWithDetails = Prisma.CompanyGetPayload<{ include: typeof detailInclude }>;

/** Companies (spec 4.4): domains, addresses, calendar, delivery defaults, owner, tier. */
@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: z.infer<typeof companyListQuerySchema>): Promise<CompanySummaryDto[]> {
    const companies = await this.prisma.company.findMany({
      where: {
        ...(query.status === 'all' ? {} : { isActive: query.status === 'active' }),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { domains: { some: { domain: { contains: query.search.toLowerCase() } } } },
              ],
            }
          : {}),
      },
      include: {
        domains: { orderBy: { domain: 'asc' } },
        priceTier: { select: { id: true, name: true } },
        owner: true,
        _count: {
          select: {
            employees: { where: { isActive: true } },
            addresses: { where: { isActive: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    return companies.map((company) => ({
      id: company.id,
      name: company.name,
      isActive: company.isActive,
      domains: company.domains.map((d) => d.domain),
      priceTier: company.priceTier,
      owner: company.owner
        ? { id: company.owner.id, name: `${company.owner.firstName} ${company.owner.lastName}` }
        : null,
      employeeCount: company._count.employees,
      addressCount: company._count.addresses,
      workingDays: company.workingDays,
    }));
  }

  async get(id: string): Promise<CompanyDetailDto> {
    const company = await this.prisma.company.findUnique({ where: { id }, include: detailInclude });
    if (!company) throw new NotFoundError('Company');
    return this.toDetail(company);
  }

  async create(input: CreateCompanyInput): Promise<CompanyDetailDto> {
    await this.checkDomainFree(input.domain, null, 'domain');
    await this.checkDetails(null, { ...input, ownerEmployeeId: null });
    try {
      const company = await this.prisma.company.create({
        data: {
          ...detailFields(input),
          domains: { create: { domain: input.domain } },
          // The first address is the default one.
          addresses: { create: { ...input.address, isDefault: true, isActive: true } },
        },
      });
      return this.get(company.id);
    } catch (error) {
      // Lost a race for the domain? Say so; otherwise it was the name.
      if (isUniqueViolation(error)) await this.checkDomainFree(input.domain, null, 'domain');
      throw translateNameClash(error, input.name);
    }
  }

  async update(id: string, input: CompanyDetailsInput): Promise<CompanyDetailDto> {
    await this.ensureExists(id);
    await this.checkDetails(id, input);
    try {
      await this.prisma.company.update({
        where: { id },
        data: { ...detailFields(input), ownerEmployeeId: input.ownerEmployeeId },
      });
    } catch (error) {
      throw translateNameClash(error, input.name);
    }
    return this.get(id);
  }

  // --- Email domains -------------------------------------------------------------------

  async addDomain(id: string, domain: string): Promise<CompanyDetailDto> {
    await this.ensureExists(id);
    await this.checkDomainFree(domain, id, 'domain');
    try {
      await this.prisma.companyDomain.create({ data: { companyId: id, domain } });
    } catch (error) {
      // Two companies claiming the same domain at the same moment: the unique index decides.
      if (isUniqueViolation(error)) await this.checkDomainFree(domain, id, 'domain');
      throw error;
    }
    return this.get(id);
  }

  async removeDomain(id: string, domainId: string): Promise<CompanyDetailDto> {
    const domain = await this.prisma.companyDomain.findFirst({
      where: { id: domainId, companyId: id },
    });
    if (!domain) throw new NotFoundError('Domain');
    const [domainCount, employees] = await Promise.all([
      this.prisma.companyDomain.count({ where: { companyId: id } }),
      this.prisma.employee.count({
        where: { companyId: id, email: { endsWith: `@${domain.domain}` } },
      }),
    ]);
    if (domainCount === 1) {
      throw new BusinessRuleError(
        'LAST_DOMAIN',
        'A company needs at least one email domain. Add the new one before removing this one.',
      );
    }
    if (employees > 0) {
      throw new BusinessRuleError(
        'DOMAIN_IN_USE',
        `${employees} ${employees === 1 ? 'employee has an email' : 'employees have emails'} on ${domain.domain}. Change their emails first.`,
      );
    }
    await this.prisma.companyDomain.delete({ where: { id: domainId } });
    return this.get(id);
  }

  // --- Delivery addresses --------------------------------------------------------------

  async addAddress(id: string, input: CompanyAddressInput): Promise<CompanyDetailDto> {
    await this.ensureExists(id);
    const activeCount = await this.prisma.companyAddress.count({
      where: { companyId: id, isActive: true },
    });
    await this.prisma.companyAddress.create({
      data: { ...input, isActive: true, companyId: id, isDefault: activeCount === 0 },
    });
    return this.get(id);
  }

  async updateAddress(
    id: string,
    addressId: string,
    input: CompanyAddressInput,
  ): Promise<CompanyDetailDto> {
    const address = await this.findAddress(id, addressId);
    if (address.isActive && !input.isActive) {
      if (address.isDefault) {
        throw new BusinessRuleError(
          'DEFAULT_ADDRESS',
          'This is the default address. Make another address the default before switching it off.',
          [{ path: 'isActive', message: 'Make another address the default first.' }],
        );
      }
    }
    // Addresses are switched off, never deleted: past orders and drops still point at them.
    await this.prisma.companyAddress.update({ where: { id: addressId }, data: input });
    return this.get(id);
  }

  /** Exactly one default address: the old default is cleared and the new one set together. */
  async makeDefaultAddress(id: string, addressId: string): Promise<CompanyDetailDto> {
    const address = await this.findAddress(id, addressId);
    if (!address.isActive) {
      throw new BusinessRuleError('ADDRESS_INACTIVE', 'Switch the address on first.');
    }
    await this.prisma.$transaction([
      this.prisma.companyAddress.updateMany({
        where: { companyId: id, isDefault: true, id: { not: addressId } },
        data: { isDefault: false },
      }),
      this.prisma.companyAddress.update({ where: { id: addressId }, data: { isDefault: true } }),
    ]);
    return this.get(id);
  }

  // --- Calendar ------------------------------------------------------------------------

  /** A day the company can't receive deliveries. It does not move cut-offs (spec 4.4). */
  async addHoliday(id: string, input: CreateKitchenHolidayInput): Promise<CompanyDetailDto> {
    await this.ensureExists(id);
    try {
      await this.prisma.companyHoliday.create({
        data: { companyId: id, date: isoDateToDb(input.date), name: input.name },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(`There is already a holiday on ${input.date}.`);
      }
      throw error;
    }
    return this.get(id);
  }

  async removeHoliday(id: string, holidayId: string): Promise<CompanyDetailDto> {
    const { count } = await this.prisma.companyHoliday.deleteMany({
      where: { id: holidayId, companyId: id },
    });
    if (count === 0) throw new NotFoundError('Holiday');
    return this.get(id);
  }

  /** Staff who can be a company's default driver: anyone whose role delivers (never a role name). */
  async driverOptions(): Promise<DriverOptionDto[]> {
    const drivers = await this.prisma.user.findMany({
      where: { isActive: true, role: { permissions: { has: 'DELIVERIES_OWN' } } },
      orderBy: { name: 'asc' },
    });
    return drivers.map((driver) => ({ id: driver.id, name: driver.name, phone: driver.phone }));
  }

  // --- Rules ---------------------------------------------------------------------------

  /**
   * Spec 4.4: two companies can't claim the same domain, and public domains such as
   * gmail.com are not allowed (the list is a platform setting).
   */
  private async checkDomainFree(domain: string, companyId: string | null, path: string) {
    const [settings, owner] = await Promise.all([
      this.prisma.platformSettings.findUniqueOrThrow({ where: { id: 1 } }),
      this.prisma.companyDomain.findUnique({ where: { domain }, include: { company: true } }),
    ]);
    if (settings.publicEmailDomains.includes(domain)) {
      const message = `${domain} is a public email provider, so it can't identify a company.`;
      throw new BusinessRuleError('PUBLIC_EMAIL_DOMAIN', message, [{ path, message }]);
    }
    if (owner) {
      const message =
        owner.companyId === companyId
          ? `${domain} is already on this company.`
          : `${domain} already belongs to ${owner.company.name}.`;
      throw new BusinessRuleError('DOMAIN_TAKEN', message, [{ path, message }]);
    }
  }

  /** References exist, the driver delivers, the owner works here, the time is bookable. */
  private async checkDetails(companyId: string | null, input: CompanyDetailsInput) {
    const problems: FieldError[] = [];
    const [settings, tier, packaging, driver, owner] = await Promise.all([
      this.prisma.platformSettings.findUniqueOrThrow({ where: { id: 1 } }),
      input.priceTierId
        ? this.prisma.priceTier.findUnique({ where: { id: input.priceTierId } })
        : null,
      input.defaultPackagingTypeId
        ? this.prisma.packagingType.findUnique({ where: { id: input.defaultPackagingTypeId } })
        : null,
      input.defaultDriverId
        ? this.prisma.user.findUnique({
            where: { id: input.defaultDriverId },
            include: { role: true },
          })
        : null,
      input.ownerEmployeeId
        ? this.prisma.employee.findUnique({ where: { id: input.ownerEmployeeId } })
        : null,
    ]);

    if (input.priceTierId && !tier) {
      problems.push({ path: 'priceTierId', message: 'That price tier no longer exists.' });
    }
    if (input.defaultPackagingTypeId && !packaging) {
      problems.push({
        path: 'defaultPackagingTypeId',
        message: 'That packaging type no longer exists.',
      });
    }
    if (
      input.defaultDriverId &&
      (!driver || !driver.isActive || !driver.role.permissions.includes('DELIVERIES_OWN'))
    ) {
      problems.push({
        path: 'defaultDriverId',
        message: 'Pick an active staff member who makes deliveries.',
      });
    }
    // Spec 4.4: the owner is one of the company's own employees.
    if (input.ownerEmployeeId && (!owner || owner.companyId !== companyId || !owner.isActive)) {
      problems.push({
        path: 'ownerEmployeeId',
        message: 'The owner must be an active employee of this company.',
      });
    }
    const timeProblem = deliveryTimeProblem(input.defaultDeliveryTimeMinutes, {
      startMinutes: settings.deliveryWindowStartMinutes,
      endMinutes: settings.deliveryWindowEndMinutes,
      slotMinutes: settings.deliverySlotMinutes,
    });
    if (timeProblem) problems.push({ path: 'defaultDeliveryTimeMinutes', message: timeProblem });

    if (problems.length > 0) {
      throw new BusinessRuleError('INVALID_COMPANY', 'Some details need fixing.', problems);
    }
  }

  private async ensureExists(id: string): Promise<void> {
    const company = await this.prisma.company.findUnique({ where: { id }, select: { id: true } });
    if (!company) throw new NotFoundError('Company');
  }

  private async findAddress(companyId: string, addressId: string) {
    const address = await this.prisma.companyAddress.findFirst({
      where: { id: addressId, companyId },
    });
    if (!address) throw new NotFoundError('Address');
    return address;
  }

  private async toDetail(company: CompanyWithDetails): Promise<CompanyDetailDto> {
    const [defaultTier, domainUse] = await Promise.all([
      company.priceTier ? null : this.prisma.priceTier.findFirst({ where: { isDefault: true } }),
      Promise.all(
        company.domains.map((d) =>
          this.prisma.employee.count({
            where: { companyId: company.id, email: { endsWith: `@${d.domain}` } },
          }),
        ),
      ),
    ]);
    const effectiveTier = company.priceTier
      ? { ...company.priceTier, isDefault: false }
      : defaultTier
        ? { id: defaultTier.id, name: defaultTier.name, isDefault: true }
        : null;

    return {
      id: company.id,
      ...detailFields(company),
      ownerEmployeeId: company.ownerEmployeeId,
      domains: company.domains.map((d, i) => ({
        id: d.id,
        domain: d.domain,
        employeeCount: domainUse[i] ?? 0,
      })),
      addresses: company.addresses.map((a) => ({
        id: a.id,
        label: a.label,
        line1: a.line1,
        line2: a.line2,
        city: a.city,
        postcode: a.postcode,
        instructions: a.instructions,
        isDefault: a.isDefault,
        isActive: a.isActive,
      })),
      holidays: company.holidays.map((h) => ({
        id: h.id,
        date: dbDateToIso(h.date),
        name: h.name,
      })),
      owner: company.owner
        ? {
            id: company.owner.id,
            name: `${company.owner.firstName} ${company.owner.lastName}`,
            email: company.owner.email,
          }
        : null,
      effectiveTier,
      employeeCount: company._count.employees,
      hiddenCategoryIds: company.hiddenCategories.map((h) => h.categoryId),
      hiddenMenuItemIds: company.hiddenMenuItems.map((h) => h.menuItemId),
      updatedAt: company.updatedAt.toISOString(),
    };
  }
}

function detailFields(input: Omit<CompanyDetailsInput, 'ownerEmployeeId'>) {
  return {
    name: input.name,
    billingContactName: input.billingContactName,
    billingEmail: input.billingEmail,
    billingPhone: input.billingPhone,
    billingAddress: input.billingAddress,
    priceTierId: input.priceTierId,
    workingDays: input.workingDays,
    defaultDeliveryTimeMinutes: input.defaultDeliveryTimeMinutes,
    deliveryLeadMinutes: input.deliveryLeadMinutes,
    defaultPackagingTypeId: input.defaultPackagingTypeId,
    driverInstructions: input.driverInstructions,
    defaultDriverId: input.defaultDriverId,
    isActive: input.isActive,
  };
}

function translateNameClash(error: unknown, name: string): unknown {
  if (!isUniqueViolation(error)) return error;
  const message = `There is already a company called “${name}”.`;
  return new BusinessRuleError('NAME_TAKEN', message, [{ path: 'name', message }]);
}
