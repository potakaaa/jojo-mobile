import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    // DEAL-005 Phase 2 (Execute-Agent Instruction E2) — pin the suite off the dev
    // host's own timezone. Several dev machines here run `Asia/Manila` (+08:00),
    // which is exactly the zone `toManilaWallClock()` computes. Without this pin, a
    // regression to host-local `Date` accessors (`getDay()`/`getHours()`) would pass
    // every Manila-offset assertion VACUOUSLY on those machines, because host-local
    // time already equals Manila time there. UTC makes such a regression fail loudly
    // on every machine. Every existing test uses explicit `Z`-suffixed ISO instants,
    // so this pin is inert for them.
    env: { TZ: 'UTC' },
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
