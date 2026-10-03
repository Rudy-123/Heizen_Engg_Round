import { Injectable } from '@nestjs/common';
import type { EmployeeDto, EmployeeInput, EmployeeListQuery, Page } from '@fernleaf/shared';
import { checkIdsExist } from '../catalogue/reference-checks.js';
import { BusinessRuleError, NotFoundError } from '../common/errors/domain-error.js';
import { isUniqueViolation } from '../common/errors/prisma-errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const employeeInclude = {
  company: { select: { id: true, name: true } },
  ownedCompany: { select: { id: true, name: true } },
  allergies: { select: { allergenId: true } },
  dietaryPreferences: { select: { dietaryTagId: true } },
} satisfies Prisma.EmployeeInclude;

type EmployeeWithDetails = Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>;

/** Orders still waiting for the cut-off: these block moving an employee to another company. */
const OPEN_ORDER_STATUSES = ['DRAFT', 'PLACED'] as const;

/** Employees (spec 4.5): every customer belongs to exactly one company. */
@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: EmployeeListQuery): Promise<Page<EmployeeDto>> {
    const where: Prisma.EmployeeWhereInput = {
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.status === 'all' ? {} : { isActive: query.status === 'active' }),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search.toLowerCase() } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        include: employeeInclude,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.employee.count({ where }),
    ]);
    return { items: items.map(toDto), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<EmployeeDto> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: employeeInclude,
    });
    if (!employee) throw new NotFoundError('Employee');
    return toDto(employee);
  }

  async create(input: EmployeeInput): Promise<EmployeeDto> {
    await this.checkEmailOnCompanyDomain(input);
    await this.checkReferences(input);
    try {
      const employee = await this.prisma.employee.create({
        data: {
          ...employeeFields(input),
          allergies: { create: input.allergenIds.map((allergenId) => ({ allergenId })) },
          dietaryPreferences: {
            create: input.dietaryTagIds.map((dietaryTagId) => ({ dietaryTagId })),
          },
        },
        include: employeeInclude,
      });
      return toDto(employee);
    } catch (error) {
      throw translateEmailClash(error, input.email);
    }
  }

  /**
   * Updates an employee. A different companyId moves them: from then on that company's
   * tier, hidden menu items, addresses and calendar apply (spec 4.5). Orders already
   * confirmed stay billed to the old company - they keep their own copy of who pays.
   */
  async update(id: string, input: EmployeeInput): Promise<EmployeeDto> {
    const current = await this.prisma.employee.findUnique({
      where: { id },
      include: { ownedCompany: true },
    });
    if (!current) throw new NotFoundError('Employee');
    const name = `${current.firstName} ${current.lastName}`;

    if (input.companyId !== current.companyId) {
      if (current.ownedCompany) {
        const message = `${name} is the owner of ${current.ownedCompany.name}. Choose a new owner there before moving them.`;
        throw new BusinessRuleError('OWNER_CANNOT_MOVE', message, [{ path: 'companyId', message }]);
      }
      const openOrders = await this.prisma.order.count({
        where: { employeeId: id, status: { in: [...OPEN_ORDER_STATUSES] } },
      });
      if (openOrders > 0) {
        const message = `${name} has ${openOrders} ${openOrders === 1 ? 'order' : 'orders'} waiting for the cut-off. Place or cancel ${openOrders === 1 ? 'it' : 'them'} before moving companies.`;
        throw new BusinessRuleError('OPEN_ORDERS', message, [{ path: 'companyId', message }]);
      }
    }
    if (current.ownedCompany && !input.isActive) {
      const message = `${name} is the owner of ${current.ownedCompany.name}. Choose a new owner before switching them off.`;
      throw new BusinessRuleError('OWNER_CANNOT_DEACTIVATE', message, [
        { path: 'isActive', message },
      ]);
    }
    await this.checkEmailOnCompanyDomain(input);
    await this.checkReferences(input);

    try {
      const [, , employee] = await this.prisma.$transaction([
        this.prisma.employeeAllergy.deleteMany({ where: { employeeId: id } }),
        this.prisma.employeeDietaryPreference.deleteMany({ where: { employeeId: id } }),
        this.prisma.employee.update({
          where: { id },
          data: {
            ...employeeFields(input),
            allergies: { create: input.allergenIds.map((allergenId) => ({ allergenId })) },
            dietaryPreferences: {
              create: input.dietaryTagIds.map((dietaryTagId) => ({ dietaryTagId })),
            },
          },
          include: employeeInclude,
        }),
      ]);
      return toDto(employee);
    } catch (error) {
      throw translateEmailClash(error, input.email);
    }
  }

  /** The email must be on one of the company's domains - that is how a company owns its people. */
  private async checkEmailOnCompanyDomain(input: EmployeeInput): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: input.companyId },
      include: { domains: { orderBy: { domain: 'asc' } } },
    });
    if (!company) {
      throw new BusinessRuleError('UNKNOWN_REFERENCE', 'That company no longer exists.', [
        { path: 'companyId', message: 'That company no longer exists.' },
      ]);
    }
    const domain = input.email.split('@')[1] ?? '';
    if (!company.domains.some((d) => d.domain === domain)) {
      const message = `Use an email on ${company.name}'s ${company.domains.length === 1 ? 'domain' : 'domains'}: ${company.domains.map((d) => d.domain).join(', ')}.`;
      throw new BusinessRuleError('EMAIL_NOT_COMPANY_DOMAIN', message, [
        { path: 'email', message },
      ]);
    }
  }

  private checkReferences(input: EmployeeInput): Promise<void> {
    return checkIdsExist([
      {
        table: this.prisma.allergen,
        ids: input.allergenIds,
        path: 'allergenIds',
        label: 'allergens',
      },
      {
        table: this.prisma.dietaryTag,
        ids: input.dietaryTagIds,
        path: 'dietaryTagIds',
        label: 'dietary tags',
      },
    ]);
  }
}

function employeeFields(input: EmployeeInput) {
  return {
    companyId: input.companyId,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    canChooseAddress: input.canChooseAddress,
    canChangeDeliveryTime: input.canChangeDeliveryTime,
    canChangePackaging: input.canChangePackaging,
    isActive: input.isActive,
  };
}

function translateEmailClash(error: unknown, email: string): unknown {
  if (!isUniqueViolation(error)) return error;
  const message = `${email} is already used by another employee.`;
  return new BusinessRuleError('EMAIL_TAKEN', message, [{ path: 'email', message }]);
}

function toDto(employee: EmployeeWithDetails): EmployeeDto {
  return {
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    phone: employee.phone,
    company: employee.company,
    canChooseAddress: employee.canChooseAddress,
    canChangeDeliveryTime: employee.canChangeDeliveryTime,
    canChangePackaging: employee.canChangePackaging,
    allergenIds: employee.allergies.map((a) => a.allergenId),
    dietaryTagIds: employee.dietaryPreferences.map((d) => d.dietaryTagId),
    isActive: employee.isActive,
    isOwner: employee.ownedCompany !== null,
  };
}
