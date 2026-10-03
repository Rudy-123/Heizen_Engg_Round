import type { TestProject } from 'vitest/node';
import { startLocalPostgres } from '../../scripts/local-postgres.js';

/**
 * Starts a throwaway PostgreSQL server for the e2e/integration tests, applies our real
 * migration files to it, and deletes it afterwards.
 *
 * - Tests never touch the Supabase database.
 * - Tests run on real Postgres (row locks, advisory locks, CHECK constraints), not a fake.
 * - Applying prisma/migrations/*.sql here also proves those files work on a fresh database.
 */
export default async function setup(project: TestProject) {
  const database = await startLocalPostgres({ database: 'fernleaf_test' });
  project.provide('databaseUrl', database.url);
  return () => database.stop();
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
