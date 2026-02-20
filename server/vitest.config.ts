import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@retailsync/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url))
    }
  }
});
