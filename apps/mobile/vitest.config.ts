import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Minimal Vitest setup, scoped to PURE-TS unit tests only (no React Native
 * rendering, no jest-expo). Added by the order-history/reorder plan (HIST-002)
 * so `reorder.ts`'s pure functions are mechanically provable. This is NOT a
 * general RN component-test framework — `packages/ui` (jest-expo) still owns RN
 * component rendering. Do not expand this to render RN components.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
