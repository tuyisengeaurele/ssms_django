import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',   // Django dev server
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Heavy libraries get their own files so they cache between releases
        // and only download on pages that use them.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('recharts') || id.includes('/d3-') || id.includes('victory-vendor')) return 'charts';
          if (id.includes('framer-motion') || id.includes('/motion-')) return 'motion';
          if (id.includes('@sentry')) return 'sentry';
          if (id.includes('react-router') || id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) return 'react';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
    css: false,
  },
});
