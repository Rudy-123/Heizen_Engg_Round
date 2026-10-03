import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedIdentity, TEST_ACCOUNTS } from './identity.js';

// Run with: npm run db:seed -w @fernleaf/api   (uses DATABASE_URL from apps/api/.env)
// Every step is an upsert, so running it again is safe.

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});

try {
  await seedIdentity(prisma);
  console.log(`Seeded roles and test accounts: ${TEST_ACCOUNTS.map((a) => a.email).join(', ')}`);
} finally {
  await prisma.$disconnect();
}
