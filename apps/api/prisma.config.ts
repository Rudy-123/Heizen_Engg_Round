import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma CLI settings (migrations, generate, seed). The running app builds its own
// connection in PrismaService; this file is only read by the `prisma` command.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed/index.ts',
  },
  datasource: {
    // process.env (not Prisma's env() helper) so `prisma generate` also works where
    // no database is configured, e.g. in CI's lint and typecheck jobs.
    url: process.env['DATABASE_URL'],
  },
});
