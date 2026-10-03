import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedIdentity, TEST_ACCOUNTS } from './identity.js';
import { seedMasterData } from './master-data.js';

// Run with: npm run db:seed -w @fernleaf/api   (uses DATABASE_URL from apps/api/.env)
// Safe to run again: roles and the four test accounts are restored to the spec; master data
// is only created where missing, never changed or deleted.

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});

try {
  await seedIdentity(prisma);
  console.log(`Seeded roles and test accounts: ${TEST_ACCOUNTS.map((a) => a.email).join(', ')}`);
  await seedMasterData(prisma);
  const [companies, employees, dishes, tiers] = await Promise.all([
    prisma.company.count(),
    prisma.employee.count(),
    prisma.dish.count(),
    prisma.priceTier.count(),
  ]);
  console.log(
    `Master data ready: ${companies} companies, ${employees} employees, ${dishes} dishes, ${tiers} price tiers.`,
  );
} finally {
  await prisma.$disconnect();
}
