import { PrismaPg } from '@prisma/adapter-pg';
import { spawn } from 'node:child_process';
import { seedIdentity } from '../prisma/seed/identity.js';
import { seedMasterData } from '../prisma/seed/master-data.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { startLocalPostgres } from './local-postgres.js';

/**
 * Runs the API against a throwaway local Postgres - no Supabase account needed.
 * Starts Postgres, applies every migration, seeds the test accounts and the demo master data,
 * then starts the built
 * API on port 4000. Ctrl+C stops everything and deletes the database.
 *
 * Usage (from the repo root):  npm run build  then  npm run sandbox -w @fernleaf/api
 */
const database = await startLocalPostgres({ port: 54329, database: 'fernleaf' });

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: database.url }) });
await seedIdentity(prisma);
await seedMasterData(prisma);
await prisma.$disconnect();
console.log(
  `Sandbox database ready (${database.url}) - test accounts and demo master data seeded.`,
);

const api = spawn(process.execPath, ['dist/main.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    // Real environment variables win over apps/api/.env, so this never reaches Supabase.
    DATABASE_URL: database.url,
    JWT_SECRET: 'sandbox-only-secret-that-is-at-least-32-characters',
    NODE_ENV: 'development',
    // The sandbox shows the same living demo kitchen as the live app.
    DEMO_MODE: 'true',
  },
});

let stopping = false;
async function stop(code: number): Promise<void> {
  if (stopping) return;
  stopping = true;
  api.kill();
  await database.stop();
  process.exit(code);
}

process.on('SIGINT', () => void stop(0));
process.on('SIGTERM', () => void stop(0));
api.on('exit', (code) => void stop(code ?? 0));
