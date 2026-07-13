import { defineConfig } from 'vitest/config';

// Pure-function unit tests — node environment, no DB/RN dependency.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
