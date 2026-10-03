import { inject } from 'vitest';

// Runs before every e2e test file, before the app is imported, so AppModule's config
// validation sees these values. The app ignores .env when NODE_ENV is "test".
const databaseUrl = inject('databaseUrl');

if (/supabase/i.test(databaseUrl)) {
  throw new Error('Refusing to run tests against a Supabase database.');
}

process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] = databaseUrl;
process.env['JWT_SECRET'] = 'test-only-secret-that-is-at-least-32-characters-long';
process.env['SESSION_TTL_HOURS'] = '12';
process.env['KITCHEN_TIME_ZONE'] = 'Asia/Kolkata';
