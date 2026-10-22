import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,js}', 'tests/unit/**/*.{test,spec}.{ts,js}', 'tests/*.test.ts'],
    exclude: ['tests/core.test.js', 'tests/collections.test.js', 'tests/scaffold.test.js'],
    passWithNoTests: true,
  },
});
