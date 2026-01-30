import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'threads',
    env: {
      LITHIA_TEST_MODE: 'true',
    }
  },
});