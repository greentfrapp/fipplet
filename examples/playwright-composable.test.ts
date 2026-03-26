/**
 * Advanced fixture example — use fipplet's PageRecorder for cursor animation,
 * zoom, and other recording-specific features alongside your own custom fixtures.
 *
 * The `fippletPage` fixture provides a PageRecorder with methods like zoom(),
 * scroll() with smooth easing, and animated cursor tracking. Use this when you
 * need polished demo recordings with visual effects beyond plain video capture.
 *
 * For basic video recording with standard Playwright APIs, see playwright-demo.test.ts.
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

// ── Configure fipplet options ───────────────────────────────────────────
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

test('PageRecorder — cursor animation and zoom', async ({
  fippletPage,
  greeting,
}) => {
  // Custom fixture works alongside fipplet
  expect(greeting).toBe('Hello from a custom fixture!')

  // fippletPage provides recording-specific methods with cursor tracking
  await fippletPage.navigate('https://en.wikipedia.org/wiki/Main_Page')
  await fippletPage.wait(1000)
  await fippletPage.screenshot('composable-homepage')

  // Zoom into the main heading with animated transition
  await fippletPage.zoom({
    selector: '#mp-welcome',
    scale: 2.5,
    duration: 800,
  })
  await fippletPage.wait(1500)
  await fippletPage.screenshot('zoomed-heading')

  // Zoom back out
  await fippletPage.zoom({ scale: 1, duration: 600 })
  await fippletPage.wait(500)

  // Smooth scroll with easing
  await fippletPage.scroll({ y: 400 })
  await fippletPage.wait(500)
  await fippletPage.screenshot('composable-scrolled')
})
