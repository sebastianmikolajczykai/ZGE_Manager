import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts'], // punkt startowy procesu, sprawdzany testami E2E
      reporter: ['text', 'html'],
      thresholds: { lines: 80, branches: 70, functions: 80, statements: 80 },
    },
  },
});
