import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: process.env.BASE_PATH || '/bostik-game/',
  define: { __TEST_MODE__: JSON.stringify(process.env.TEST_MODE === '1') },
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 1800 },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
