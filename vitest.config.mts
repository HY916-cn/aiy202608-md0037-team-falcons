import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'apps/client/src/**/__tests__/**/*.test.ts',
      'packages/**/__tests__/**/*.test.ts',
    ],
  },
});
