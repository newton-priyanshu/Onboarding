import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// Separate from vite.config.ts (rather than a `test` block bolted onto it)
// so the test environment/setup is explicit and doesn't get lost among the
// build-only settings. Mirrors the same plugins/aliases as vite.config.ts.
export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: false,
  },
});
