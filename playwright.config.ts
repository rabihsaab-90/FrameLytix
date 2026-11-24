import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests drive the BUILT Electron app (out/) via Playwright's Electron support.
 * Run with `npm run test:e2e` (builds first). Each test uses fresh temp directories for
 * user data and projects; real user projects are never touched.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  }
});
