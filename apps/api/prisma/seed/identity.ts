import bcrypt from 'bcryptjs';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { Dashboard, Permission } from '../../src/generated/prisma/enums.js';

/**
 * The four roles from spec §3. Roles are data: a new role is a new entry here (or a row
 * added later by an admin), with no code changes, because code only checks permissions.
 */
export const ROLE_DEFINITIONS = [
  {
    key: 'admin',
    name: 'Admin',
    description:
      'Everything: catalogue, pricing, companies, employees, orders, billing, settings, staff. Can override anything.',
    homeDashboard: Dashboard.ADMIN,
    // Everything except DELIVERIES_OWN, which is what makes someone a driver (assignable to
    // drops). Admins deliver on a driver's behalf through DELIVERIES_ANY instead.
    permissions: Object.values(Permission).filter(
      (permission) => permission !== Permission.DELIVERIES_OWN,
    ),
  },
  {
    key: 'kitchen',
    name: 'Kitchen',
    description:
      'Sees what has to be cooked and marks prep units started and done. Read-only on dish details.',
    homeDashboard: Dashboard.KITCHEN,
    permissions: [Permission.KITCHEN_READ, Permission.KITCHEN_WORK, Permission.CATALOGUE_READ],
  },
  {
    key: 'dispatch',
    name: 'Dispatch',
    description:
      'Moves cooked orders out of the door, assigns drivers to drops and tracks delivery. Can see the kitchen board.',
    homeDashboard: Dashboard.DISPATCH,
    permissions: [Permission.DISPATCH_READ, Permission.DISPATCH_MANAGE, Permission.KITCHEN_READ],
  },
  {
    key: 'driver',
    name: 'Driver',
    description: 'Sees only their own drops for today and marks them delivered.',
    homeDashboard: Dashboard.DRIVER,
    permissions: [Permission.DELIVERIES_OWN],
  },
] as const;

/** The reviewers' accounts, with exactly the credentials given in spec §2. */
export const TEST_ACCOUNT_PASSWORD = 'Test@1234';

export const TEST_ACCOUNTS = [
  { email: 'admin@test.com', name: 'Priya Sharma', roleKey: 'admin' },
  { email: 'kitchen@test.com', name: 'Rahul Verma', roleKey: 'kitchen' },
  { email: 'dispatch@test.com', name: 'Neha Iyer', roleKey: 'dispatch' },
  { email: 'driver@test.com', name: 'Vikram Singh', roleKey: 'driver', phone: '+91 98200 11223' },
] as const;

/**
 * Creates or updates the roles and the four test accounts. Safe to run any number of times:
 * re-running restores the test accounts' exact role and password if someone changed them.
 */
export async function seedIdentity(prisma: PrismaClient): Promise<void> {
  const roleIds = new Map<string, string>();
  for (const role of ROLE_DEFINITIONS) {
    const data = {
      name: role.name,
      description: role.description,
      homeDashboard: role.homeDashboard,
      permissions: [...role.permissions],
    };
    const saved = await prisma.role.upsert({
      where: { key: role.key },
      create: { key: role.key, ...data },
      update: data,
    });
    roleIds.set(role.key, saved.id);
  }

  const passwordHash = await bcrypt.hash(TEST_ACCOUNT_PASSWORD, 10);
  for (const account of TEST_ACCOUNTS) {
    const roleId = roleIds.get(account.roleKey);
    if (!roleId) throw new Error(`Unknown role ${account.roleKey}`);
    const data = {
      name: account.name,
      passwordHash,
      roleId,
      isActive: true,
      phone: 'phone' in account ? account.phone : null,
    };
    await prisma.user.upsert({
      where: { email: account.email },
      create: { email: account.email, ...data },
      update: data,
    });
  }
}
