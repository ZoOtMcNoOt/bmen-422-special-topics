import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // No test renders or touches the DOM; setup.ts only polyfills ImageData for the
    // ground-truth image sampler.
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    setupFiles: ['__tests__/setup.ts'],
    testTimeout: 30_000,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
