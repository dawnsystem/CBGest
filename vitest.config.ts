import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'vitest.setup.ts',
        'vitest.config.ts',
        'vite.config.ts',
        '**/*.d.ts',
        '**/__mocks__/**',
        '**/dist/**',
        '**/.{idea,git,cache,output,temp}/**',
        'index.tsx',
      ],
      lines: 80,
      functions: 75,
      branches: 75,
      statements: 80,
    },
    include: ['**/__tests__/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
