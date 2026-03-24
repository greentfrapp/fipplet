/**
 * Minimal Playwright config for running fipplet example tests.
 *
 * Run:
 *   npx playwright test --config examples/playwright.config.ts
 */

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '*.test.ts',
  timeout: 60_000,
  retries: 0,
  reporter: 'html',
  use: {
    headless: true,
  },
})
