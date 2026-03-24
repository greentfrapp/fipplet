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
 */

import { test, expect } from 'fipplet/playwright'

// ── Global options for all tests in this file ──────────────────────────
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

// ── Tests ──────────────────────────────────────────────────────────────

test('Wikipedia — browse and read an article', async ({ fippletPage }) => {
  // Navigate to Wikipedia
  await fippletPage.navigate('https://en.wikipedia.org/wiki/Main_Page')
  await fippletPage.wait(1000)
  await fippletPage.screenshot('homepage')

  // Scroll down to the "From today's featured article" section
  await fippletPage.scroll({ y: 400 })
  await fippletPage.wait(500)

  // Click the first link in the featured article
  await fippletPage.click('#mp-tfa-img a')
  await fippletPage.wait(2000)
  await fippletPage.screenshot('article')

  // Scroll through the article
  await fippletPage.scroll({ y: 500 })
  await fippletPage.wait(1000)
  await fippletPage.screenshot('article-scrolled')
})

test('Wikipedia — zoom into a heading', async ({ fippletPage }) => {
  await fippletPage.navigate('https://en.wikipedia.org/wiki/Main_Page')
  await fippletPage.wait(1000)

  // Zoom into the main heading
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
})

test('Wikipedia — search for a topic', async ({ fippletPage }) => {
  await fippletPage.navigate('https://en.wikipedia.org/wiki/Main_Page')
  await fippletPage.wait(1000)

  // Click the search input and type a query
  await fippletPage.click('#searchInput')
  await fippletPage.type(
    '#searchform input[name="search"]',
    'Playwright browser automation',
    { delay: 50 },
  )
  await fippletPage.wait(1000)
  await fippletPage.screenshot('search-typed')

  // Submit the search
  await fippletPage.keyboard('Enter')
  await fippletPage.wait(2000)
  await fippletPage.screenshot('search-results')
})
