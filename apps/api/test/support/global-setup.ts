import EmbeddedPostgres from 'embedded-postgres';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

/**
 * Starts a throwaway PostgreSQL server for the e2e/integration tests, applies our real
 * migration files to it, and deletes it afterwards.
 *
 * - Tests never touch the Supabase database.
 * - Tests run on real Postgres (row locks, advisory locks, ...), not a fake.
 * - Applying prisma/migrations/*.sql here also proves those files work on a fresh database.
 */
export default async function setup(project: TestProject) {
  const port = await findFreePort();
  const server = new EmbeddedPostgres({
    databaseDir: await mkdtemp(join(tmpdir(), 'fernleaf-test-db-')),
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
    onLog: () => {},
  });
  await server.initialise();
  await server.start();
  await server.createDatabase('fernleaf_test');

  const databaseUrl = `postgresql://postgres:postgres@localhost:${port}/fernleaf_test`;
  await applyMigrations(databaseUrl);
  project.provide('databaseUrl', databaseUrl);

  return async () => {
    await server.stop();
  };
}

async function applyMigrations(databaseUrl: string): Promise<void> {
  const migrationsDir = join(import.meta.dirname, '..', '..', 'prisma', 'migrations');
  const folders = (await readdir(migrationsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    for (const folder of folders) {
      await client.query(await readFile(join(migrationsDir, folder, 'migration.sql'), 'utf8'));
    }
  } finally {
    await client.end();
  }
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('No port')),
      );
    });
  });
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
