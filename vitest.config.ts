import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'ink/jsx-dev-runtime': 'react/jsx-dev-runtime',
      'ink/jsx-runtime': 'react/jsx-runtime',
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    pool: 'vmForks',
    maxWorkers: 8,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/types/**'],
    },
  },
});
