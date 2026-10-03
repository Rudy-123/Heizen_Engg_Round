import { Injectable } from '@nestjs/common';
import {
  REVIEWER_ACCOUNT_EMAILS,
  type CreateStaffInput,
  type RoleDto,
  type SessionUser,
  type StaffMemberDto,
  type UpdateStaffInput,
} from '@fernleaf/shared';
import bcrypt from 'bcryptjs';
import { BusinessRuleError, NotFoundError } from '../common/errors/domain-error.js';
import { isUniqueViolation } from '../common/errors/prisma-errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const staffInclude = { role: true } satisfies Prisma.UserInclude;
type StaffWithRole = Prisma.UserGetPayload<{ include: typeof staffInclude }>;

const reviewerEmails: readonly string[] = REVIEWER_ACCOUNT_EMAILS;

/** Staff accounts and roles (spec §3). Roles are data; code only ever checks permissions. */
@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<StaffMemberDto[]> {
    const staff = await this.prisma.user.findMany({
      include: staffInclude,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return staff.map(toDto);
  }

  async roles(): Promise<RoleDto[]> {
    const roles = await this.prisma.role.findMany({
      include: { _count: { select: { users: { where: { isActive: true } } } } },
      orderBy: { name: 'asc' },
    });
    return roles.map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description ?? '',
      homeDashboard: role.homeDashboard,
      permissions: role.permissions,
      activeStaffCount: role._count.users,
    }));
  }

  async create(input: CreateStaffInput): Promise<StaffMemberDto> {
    await this.findRole(input.roleId);
    try {
      const user = await this.prisma.user.create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone,
          roleId: input.roleId,
          passwordHash: await bcrypt.hash(input.password, 10),
        },
        include: staffInclude,
      });
      return toDto(user);
    } catch (error) {
      throw translateEmailClash(error, input.email);
    }
  }

  async update(id: string, input: UpdateStaffInput, actor: SessionUser): Promise<StaffMemberDto> {
    const current = await this.prisma.user.findUnique({ where: { id }, include: staffInclude });
    if (!current) throw new NotFoundError('Staff member');
    const role = await this.findRole(input.roleId);

    if (reviewerEmails.includes(current.email)) {
      const locked =
        input.email !== current.email || input.roleId !== current.roleId || !input.isActive;
      if (locked) {
        throw new BusinessRuleError(
          'REVIEWER_ACCOUNT_LOCKED',
          'The four reviewer accounts must keep their email, role and password, so only their name and phone can change.',
        );
      }
    }

    const keepsStaffAccess = input.isActive && role.permissions.includes('STAFF_MANAGE');
    if (id === actor.id && !keepsStaffAccess) {
      const message = input.isActive
        ? 'You can’t take staff management away from yourself. Ask another admin.'
        : 'You can’t switch off your own account.';
      throw new BusinessRuleError('CANNOT_LOCK_YOURSELF_OUT', message, [
        { path: input.isActive ? 'roleId' : 'isActive', message },
      ]);
    }
    // Someone must always be able to manage staff, or nobody could ever fix a mistake.
    if (
      current.role.permissions.includes('STAFF_MANAGE') &&
      current.isActive &&
      !keepsStaffAccess
    ) {
      const others = await this.prisma.user.count({
        where: { id: { not: id }, isActive: true, role: { permissions: { has: 'STAFF_MANAGE' } } },
      });
      if (others === 0) {
        throw new BusinessRuleError(
          'LAST_STAFF_MANAGER',
          `${current.name} is the only active person who can manage staff. Give someone else that access first.`,
        );
      }
    }

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone,
          roleId: input.roleId,
          isActive: input.isActive,
        },
        include: staffInclude,
      });
      return toDto(user);
    } catch (error) {
      throw translateEmailClash(error, input.email);
    }
  }

  /**
   * Sets a new password chosen by an admin (there is no email-based reset - emails are out of
   * scope). Switching an account off is what ends its sessions: every request re-checks it.
   */
  async resetPassword(id: string, password: string): Promise<StaffMemberDto> {
    const current = await this.prisma.user.findUnique({ where: { id } });
    if (!current) throw new NotFoundError('Staff member');
    if (reviewerEmails.includes(current.email)) {
      throw new BusinessRuleError(
        'REVIEWER_ACCOUNT_LOCKED',
        'The reviewer accounts keep the password given in the assignment.',
      );
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, 10) },
      include: staffInclude,
    });
    return toDto(user);
  }

  private async findRole(roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new BusinessRuleError('UNKNOWN_REFERENCE', 'That role no longer exists.', [
        { path: 'roleId', message: 'That role no longer exists.' },
      ]);
    }
    return role;
  }
}

function translateEmailClash(error: unknown, email: string): unknown {
  if (!isUniqueViolation(error)) return error;
  const message = `${email} already has a staff account.`;
  return new BusinessRuleError('EMAIL_TAKEN', message, [{ path: 'email', message }]);
}

function toDto(user: StaffWithRole): StaffMemberDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: { id: user.role.id, key: user.role.key, name: user.role.name },
    isActive: user.isActive,
    isReviewerAccount: reviewerEmails.includes(user.email),
  };
}
