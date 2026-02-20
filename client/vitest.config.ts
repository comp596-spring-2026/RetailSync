import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/test/setup.ts']
  },
  resolve: {
    alias: {
      '@retailsync/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url))
    }
  }
});
