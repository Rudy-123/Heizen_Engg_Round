import EmbeddedPostgres from 'embedded-postgres';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

/**
 * A real, throwaway PostgreSQL server on this machine (via `embedded-postgres`), with our
 * migration files applied. Used by the e2e tests and by `npm run sandbox`, so neither
 * ever touches a shared database. Deleted when stopped.
 */
export async function startLocalPostgres(options: { port?: number; database: string }) {
  const port = options.port ?? (await findFreePort());
  const server = new EmbeddedPostgres({
    databaseDir: await mkdtemp(join(tmpdir(), 'fernleaf-pg-')),
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
    onLog: () => {},
  });
  await server.initialise();
  await server.start();
  await server.createDatabase(options.database);

  const url = `postgresql://postgres:postgres@localhost:${port}/${options.database}`;
  await applyMigrations(url);
  return { url, stop: () => server.stop() };
}

/** Runs every prisma/migrations/<name>/migration.sql in order - the same files run on Supabase. */
async function applyMigrations(databaseUrl: string): Promise<void> {
  const migrationsDir = join(import.meta.dirname, '..', 'prisma', 'migrations');
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
          : reject(new Error('No free port')),
      );
    });
  });
}
