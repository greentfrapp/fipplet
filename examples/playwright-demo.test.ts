/**
 * Sample Playwright test that produces polished screen recordings using testreel.
 *
 * Run from the testreel package directory:
 *   cd testreel
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
 * the `testreelPage` (PageRecorder) fixture.
 */

import { test, expect } from '@playwright/test'
import { testreelFixtures, type TestreelFixtures } from 'testreel/playwright'

const recorded = test.extend<TestreelFixtures>({
  ...testreelFixtures,
})

// ── Global options for all recorded tests in this file ─────────────────
recorded.use({
  testreelOptions: {
    viewport: { width: 1280, height: 720 },
  },
})

// ── Tests ──────────────────────────────────────────────────────────────

recorded('TodoMVC — add and complete todos', async ({ page }) => {
  await page.goto('https://demo.playwright.dev/todomvc')
  await page.waitForTimeout(1000)

  // Add a few todos
  await page.fill('.new-todo', 'Buy groceries')
  await page.keyboard.press('Enter')
  await page.fill('.new-todo', 'Walk the dog')
  await page.keyboard.press('Enter')
  await page.fill('.new-todo', 'Read a book')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)

  // Complete the first todo
  await page.click('.todo-list li:first-child .toggle')
  await page.waitForTimeout(1000)
})

recorded('TodoMVC — filter todos', async ({ page }) => {
  await page.goto('https://demo.playwright.dev/todomvc')
  await page.waitForTimeout(1000)

  // Add todos and complete one
  await page.fill('.new-todo', 'Buy groceries')
  await page.keyboard.press('Enter')
  await page.fill('.new-todo', 'Walk the dog')
  await page.keyboard.press('Enter')
  await page.click('.todo-list li:first-child .toggle')
  await page.waitForTimeout(500)

  // Filter to active todos
  await page.click('a[href="#/active"]')
  await page.waitForTimeout(1000)

  // Filter to completed todos
  await page.click('a[href="#/completed"]')
  await page.waitForTimeout(1000)
})
