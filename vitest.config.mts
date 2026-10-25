import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': import.meta.dirname } },
  test: {
    include: ['tests/engine/**/*.test.ts', 'tests/auth/**/*.test.ts', 'tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['lib/engine/**/*.ts'],
      exclude: ['lib/engine/types.ts', 'lib/engine/index.ts'],
      thresholds: { lines: 90 },
      reporter: ['text-summary', 'text'],
    },
  },
});
