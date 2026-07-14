import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup-env.ts'],
    // Serialize DB-backed suites: removes the concurrent-DB-load root cause of
    // the orders.test.ts beforeAll timeout.
    fileParallelism: false,
    // Headroom for the DB setup hooks (drop/create/migrate + per-suite seeds).
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
