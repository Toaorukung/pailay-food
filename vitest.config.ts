import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The suite deliberately covers only logic that can be wrong silently:
    // money, allergen matching, session enforcement rules and search.
    setupFiles: ['tests/setup.ts'],
  },
});
