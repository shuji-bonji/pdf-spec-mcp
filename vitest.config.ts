import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/types/**'],
    },
    testTimeout: 60000,
    // Unit tests never touch the on-disk index cache (Issue #6): the fixtures use fake PDF
    // paths, and a developer's ~/.cache must not be read from or written to by `npm test`.
    // index-store.test.ts constructs its own stores with explicit options.
    env: { PDF_SPEC_CACHE: 'off' },
  },
});
