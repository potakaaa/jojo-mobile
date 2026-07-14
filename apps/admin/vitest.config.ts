import { defineConfig } from 'vitest/config';
import viteReact from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Separate from vite.config.ts so the test run does NOT load the tanstackStart
// SSR plugin — component tests render presentational components directly in jsdom.
export default defineConfig({
  plugins: [viteReact()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    css: false,
  },
});
