/**
 * Sample Playwright test that produces polished screen recordings using fipplet.
 *
 * Run from the fipplet package directory:
 *   cd fipplet
 *   pnpm exec playwright test --config examples/playwright.config.ts
 *
 * Or via the package script:
 *   pnpm test:examples
 *
 * Output:
 *   Videos and screenshots are attached to the Playwright HTML report.
 *   Open it with: pnpm exec playwright show-report
 *
 * This example uses the drop-in `page` fixture — your existing Playwright tests
 * work unchanged, just swap `test` for `recorded`. For advanced features like
 * cursor animation and zoom, see playwright-composable.test.ts which uses
 * the `fippletPage` (PageRecorder) fixture.
 */

import { test, expect } from '@playwright/test'
import { fippletFixtures, type FippletFixtures } from 'fipplet/playwright'

const recorded = test.extend<FippletFixtures>({
  ...fippletFixtures,
})

// ── Global options for all recorded tests in this file ─────────────────
recorded.use({
  fippletOptions: {
    viewport: { width: 1280, height: 720 },
  },
})

// ── Tests ──────────────────────────────────────────────────────────────

recorded('Wikipedia — browse and read an article', async ({ page }) => {
  // Navigate to Wikipedia
  await page.goto('https://en.wikipedia.org/wiki/Main_Page')
  await page.waitForTimeout(1000)

  // Scroll down to the "From today's featured article" section
  await page.evaluate(() => window.scrollBy(0, 400))
  await page.waitForTimeout(500)

  // Click the first link in the featured article
  await page.click('#mp-tfa-img a')
  await page.waitForTimeout(2000)

  // Scroll through the article
  await page.evaluate(() => window.scrollBy(0, 500))
  await page.waitForTimeout(1000)
})

recorded('Wikipedia — search for a topic', async ({ page }) => {
  await page.goto('https://en.wikipedia.org/wiki/Main_Page')
  await page.waitForTimeout(1000)

  // Click the search input and type a query
  await page.click('#searchInput')
  await page.fill('#searchform input[name="search"]', 'Playwright browser automation')
  await page.waitForTimeout(1000)

  // Submit the search
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2000)
})
