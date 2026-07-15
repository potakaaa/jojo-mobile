import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// tanstackStart() must be registered BEFORE @vitejs/plugin-react (per TanStack
// Start docs). Vite 8's native tsconfig-paths resolution powers the `@/*` alias.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
});
