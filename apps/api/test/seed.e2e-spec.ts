import { PrismaPg } from '@prisma/adapter-pg';
import { seedIdentity } from '../prisma/seed/identity.js';
import { seedMasterData } from '../prisma/seed/master-data.js';
import { startLocalPostgres } from '../scripts/local-postgres.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * The demo data reviewers will see. It runs in its own throwaway database (not the shared
 * e2e one), and must follow the same business rules the API enforces.
 */
describe('Demo master data (seed)', () => {
  let database: Awaited<ReturnType<typeof startLocalPostgres>>;
  let prisma: PrismaClient;

  const counts = () =>
    Promise.all([
      prisma.company.count(),
      prisma.employee.count(),
      prisma.dish.count(),
      prisma.option.count(),
      prisma.optionGroup.count(),
      prisma.priceTier.count(),
      prisma.dishPrice.count(),
      prisma.menuItem.count(),
      prisma.user.count(),
    ]);

  beforeAll(async () => {
    database = await startLocalPostgres({ database: 'seed_check' });
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: database.url }) });
    await seedIdentity(prisma);
    await seedMasterData(prisma);
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await database.stop();
  });

  it('creates a realistic kitchen: companies with employees, a full menu, priced tiers', async () => {
    const [companies, employees, dishes, options, groups, tiers] = await counts();
    expect(companies).toBe(9);
    expect(employees).toBeGreaterThanOrEqual(200);
    expect(dishes).toBeGreaterThanOrEqual(30);
    expect(options).toBeGreaterThanOrEqual(20);
    expect(groups).toBeGreaterThan(20);
    expect(tiers).toBe(5);
    const defaults = await prisma.priceTier.findMany({ where: { isDefault: true } });
    expect(defaults.map((tier) => tier.name)).toEqual(['Standard']);
  });

  it('follows the rules the API enforces', async () => {
    const [settings, companies, drivers] = await Promise.all([
      prisma.platformSettings.findUniqueOrThrow({ where: { id: 1 } }),
      prisma.company.findMany({
        include: { domains: true, addresses: true, employees: true, owner: true },
      }),
      prisma.user.findMany({ where: { role: { permissions: { has: 'DELIVERIES_OWN' } } } }),
    ]);
    const driverIds = new Set(drivers.map((driver) => driver.id));
    for (const company of companies) {
      const domains = company.domains.map((d) => d.domain);
      expect(domains.some((d) => settings.publicEmailDomains.includes(d))).toBe(false);
      // Every employee's email is on one of their company's domains.
      for (const employee of company.employees) {
        expect(domains).toContain(employee.email.split('@')[1]);
      }
      // The owner is one of the company's own, active employees.
      expect(company.owner?.companyId).toBe(company.id);
      expect(company.owner?.isActive).toBe(true);
      expect(company.addresses.filter((a) => a.isDefault)).toHaveLength(1);
      expect(company.defaultDriverId && driverIds.has(company.defaultDriverId)).toBe(true);
    }
    // driver@test.com is the default driver for two companies, so it gets drops every day.
    const reviewerDriver = drivers.find((driver) => driver.email === 'driver@test.com');
    expect(companies.filter((c) => c.defaultDriverId === reviewerDriver?.id)).toHaveLength(2);

    // Portioned groups: every option supports all of the group's sizes (spec 4.1).
    const portioned = await prisma.optionGroup.findMany({
      where: { usesPortions: true },
      include: {
        portionSizes: true,
        options: { include: { option: { include: { portions: true } } } },
      },
    });
    for (const group of portioned) {
      for (const { option } of group.options) {
        const sold = new Set(option.portions.map((p) => p.portionSizeId));
        expect(group.portionSizes.every((size) => sold.has(size.portionSizeId))).toBe(true);
      }
    }
  });

  it('is safe to run again: nothing is duplicated or changed', async () => {
    const before = await counts();
    const zephyr = await prisma.company.findUniqueOrThrow({ where: { name: 'Zephyr Labs' } });
    await prisma.company.update({ where: { id: zephyr.id }, data: { deliveryLeadMinutes: 75 } });

    await seedIdentity(prisma);
    await seedMasterData(prisma);

    expect(await counts()).toEqual(before);
    // An edit made in the app survives a re-run.
    expect(
      (await prisma.company.findUniqueOrThrow({ where: { id: zephyr.id } })).deliveryLeadMinutes,
    ).toBe(75);
  });
});
