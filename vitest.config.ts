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
      // YAML files are read at runtime by the config loader, which causes the
      // v8 provider to feed them to rolldown for source-map remapping. Rolldown
      // can't parse YAML and emits a noisy RolldownError. Exclude them.
      exclude: ['src/types/**', '**/*.yml', '**/*.yaml'],
    },
  },
});
