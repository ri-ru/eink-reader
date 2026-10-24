import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.mjs',
  fullyParallel: true,
  workers: 3,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  outputDir: '../test-results',
  reporter: 'list',
  use: {
    browserName: 'chromium',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
    viewport: { width: 412, height: 820 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
