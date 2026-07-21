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
    // Picking a date drives a real Radix popover, a react-day-picker month grid and
    // the SVG clock dial through jsdom, and a form with both a start and an end does
    // it twice. That lands around 1.5s locally but ~6s on a CI runner, which blew the
    // 5s default. The work is real, not a hang — this is headroom for the slower box,
    // so a genuine deadlock still fails the run rather than hanging it forever.
    testTimeout: 20_000,
  },
});
