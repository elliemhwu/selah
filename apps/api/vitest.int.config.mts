import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import swc from 'unplugin-swc';

// HTTP integration tests against the selah_test database (ADR 0017).
// Run with `pnpm nx run api:integration` (needs Docker Postgres running).
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/api-int',
  plugins: [nxViteTsPaths(), swc.vite({ module: { type: 'es6' } })],
  test: {
    name: 'api-integration',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.int-spec.ts'],
    setupFiles: ['src/testing/integration-setup.ts'],
    // One database: run test files one after another.
    fileParallelism: false,
    reporters: ['default'],
  },
}));
