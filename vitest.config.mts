import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'apps/client/src/**/__tests__/**/*.test.ts',
      'apps/desktop/src/**/__tests__/**/*.test.mjs',
      'packages/**/__tests__/**/*.test.ts',
      'scripts/**/__tests__/**/*.test.mjs',
    ],
  },
});
