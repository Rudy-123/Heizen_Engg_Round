import { defineConfig } from 'vitest/config';

// End-to-end tests: boot the real Nest app against a throwaway Postgres (see
// test/support/global-setup.ts) and call it over HTTP (test/*.e2e-spec.ts).
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    setupFiles: ['test/support/setup-env.ts'],
    // Test files share one database, so run them one after another.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
