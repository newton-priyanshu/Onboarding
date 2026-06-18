import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  build: {
    // Generate sourcemaps for production debugging but not for end users
    sourcemap: false,
    // Enable fast minification
    minify: 'esbuild',
    // Split CSS into separate file
    cssCodeSplit: true,
    // Chunk size warning limit
    chunkSizeWarningLimit: 500,
  },

  server: {
    port: 5173,
    strictPort: false,
    open: false,
  },

  // Prevent accidental env var leakage
  envPrefix: 'VITE_',
});
