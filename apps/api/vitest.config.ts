import { defineConfig } from 'vitest/config';

// Unit tests: fast, no database. They sit next to the code they test (*.spec.ts).
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
  },
});
