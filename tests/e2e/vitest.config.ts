/**
 * Vitest configuration for E2E tests.
 * Uses real PDF files — runs slower than unit tests.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 120_000, // search_spec 等の重い操作
    hookTimeout: 60_000, // beforeAll (registry init + PDF load)
    sequence: { concurrent: false }, // 順序実行（PDF 共有リソース）
    reporters: ['verbose'],
    globals: true,
    environment: 'node',
  },
});
