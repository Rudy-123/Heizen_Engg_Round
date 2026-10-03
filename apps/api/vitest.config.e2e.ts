import { defineConfig } from 'vitest/config';

// End-to-end tests: boot the real Nest app and call it over HTTP (test/*.e2e-spec.ts).
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
  },
});
