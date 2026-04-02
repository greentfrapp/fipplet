/**
 * Advanced fixture example — use testreel's PageRecorder for cursor animation,
 * zoom, and other recording-specific features alongside your own custom fixtures.
 *
 * The `testreelPage` fixture provides a PageRecorder with methods like zoom(),
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
  testreelFixtures,
  type TestreelFixtures,
} from 'testreel/playwright'

// ── Your own custom fixtures ────────────────────────────────────────────
type MyFixtures = {
  /** Example: a fixture that provides a greeting string */
  greeting: string
}

const test = base.extend<TestreelFixtures & MyFixtures>({
  // Spread testreel's fixtures in
  ...testreelFixtures,

  // Your own fixtures alongside
  greeting: async ({}, use) => {
    await use('Hello from a custom fixture!')
  },
})

// ── Configure testreel options ───────────────────────────────────────────
test.use({
  testreelOptions: {
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
  testreelPage,
  greeting,
}) => {
  // Custom fixture works alongside testreel
  expect(greeting).toBe('Hello from a custom fixture!')

  // PageRecorder provides recording-specific methods with cursor tracking
  await testreelPage.navigate('https://demo.playwright.dev/todomvc')
  await testreelPage.wait(1000)
  await testreelPage.screenshot('composable-empty')

  // Zoom into the heading with animated transition
  await testreelPage.zoom({
    selector: 'h1',
    scale: 2.5,
    duration: 800,
  })
  await testreelPage.wait(1500)
  await testreelPage.screenshot('zoomed-heading')

  // Zoom back out
  await testreelPage.zoom({ scale: 1, duration: 600 })
  await testreelPage.wait(500)

  // Add a todo with animated typing
  await testreelPage.type('.new-todo', 'Buy groceries')
  await testreelPage.keyboard('Enter')
  await testreelPage.wait(500)

  // Smooth scroll with easing
  await testreelPage.scroll({ y: 200 })
  await testreelPage.wait(500)
  await testreelPage.screenshot('composable-with-todo')
})

// ── Regression: scale 2 + chrome + background must not fail ─────────────

test.describe('HiDPI recording', () => {
  test.use({
    testreelOptions: {
      viewport: { width: 1280, height: 720 },
      scale: 2,
      chrome: { url: true },
      background: {
        gradient: { from: '#667eea', to: '#764ba2' },
        padding: 60,
        borderRadius: 12,
      },
    },
  })

  test('scale 2 with chrome and background', async ({ testreelPage }) => {
    await testreelPage.navigate('https://demo.playwright.dev/todomvc')
    await testreelPage.wait(500)
    await testreelPage.type('.new-todo', 'HiDPI test')
    await testreelPage.keyboard('Enter')
    await testreelPage.screenshot('hidpi-todo')
  })
})
