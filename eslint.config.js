const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/.expo/**',
    '**/dist/**',
    '**/coverage/**',
  ]),
  expoConfig,
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    settings: {
      'import/resolver': {
        typescript: {
          project: ['apps/client/tsconfig.json'],
        },
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
]);
