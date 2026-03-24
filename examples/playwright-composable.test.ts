/**
 * Composable fixture example — use fipplet alongside your own custom fixtures.
 *
 * Instead of importing `test` from `fipplet/playwright`, this example shows
 * how to merge fipplet's fixtures into your own extended test. This is ideal
 * when your project already has custom fixtures (auth, database, feature flags, etc.).
 *
 * Run:
 *   pnpm exec playwright test --config examples/playwright.config.ts playwright-composable
 */

import { test as base, expect } from '@playwright/test'
import {
  fippletFixtures,
  type FippletFixtures,
} from 'fipplet/playwright'

// ── Your own custom fixtures ────────────────────────────────────────────
type MyFixtures = {
  /** Example: a fixture that provides a greeting string */
  greeting: string
}

const test = base.extend<FippletFixtures & MyFixtures>({
  // Spread fipplet's fixtures in
  ...fippletFixtures,

  // Your own fixtures alongside
  greeting: async ({}, use) => {
    await use('Hello from a custom fixture!')
  },
})

// ── Configure fipplet options (same API as the simple import) ───────────
test.use({
  fippletOptions: {
    viewport: { width: 1280, height: 720 },
    chrome: { url: true },
    background: {
      gradient: { from: '#667eea', to: '#764ba2' },
      padding: 60,
      borderRadius: 12,
    },
  },
})

// ── Tests ───────────────────────────────────────────────────────────────

test('composable fixtures — fipplet + custom', async ({
  fippletPage,
  greeting,
}) => {
  // Custom fixture works alongside fipplet
  expect(greeting).toBe('Hello from a custom fixture!')

  // fippletPage works exactly the same as the simple import
  await fippletPage.navigate('https://en.wikipedia.org/wiki/Main_Page')
  await fippletPage.wait(1000)
  await fippletPage.screenshot('composable-homepage')

  await fippletPage.scroll({ y: 400 })
  await fippletPage.wait(500)
  await fippletPage.screenshot('composable-scrolled')
})
