import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()] as any,
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setupTests.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
