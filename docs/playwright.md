# Playwright Integration

Testreel integrates with Playwright in three ways:

1. **`page` fixture** (`testreel/playwright`) — drop-in recording for existing tests. Your test body stays unchanged — just use a different `test` function and testreel records video automatically
2. **`testreelPage` fixture** (`testreel/playwright`) — advanced recording with animated cursor, zoom, smooth scroll, and other visual effects via the `PageRecorder` API
3. **`recordPage()` API** (`testreel`) — wrap any existing Playwright `Page` with cursor tracking and post-processing in a custom script

## Test fixture

### Setup

Install testreel alongside your existing Playwright setup:

```bash
npm install testreel
```

### Basic usage

Compose testreel's fixtures into your test and swap `test` for `recorded` on any test you want to capture:

```js
import { test, expect } from '@playwright/test'
import { testreelFixtures, type TestreelFixtures } from 'testreel/playwright'

const recorded = test.extend<TestreelFixtures>({
  ...testreelFixtures,
})

// This test is unchanged — no recording
test('health check', async ({ page }) => {
  await page.goto('/health')
  await expect(page.locator('.status')).toHaveText('OK')
})

// Just swap test → recorded — video is attached to the test report automatically
recorded('product demo', async ({ page }) => {
  await page.goto('https://myapp.com')
  await page.click('.sign-up')
  await page.fill('#email', 'user@example.com')
  await page.fill('#password', 's3cure-password')
  await page.click('button[type=submit]')
  await page.waitForTimeout(2000)
})
```

The `page` fixture creates a recording-enabled browser context that preserves your project's Playwright config (storageState, locale, extraHTTPHeaders, etc.). On teardown it finalizes the video and attaches it to the test report.

### Advanced: PageRecorder

For polished demo recordings with animated cursor, zoom effects, and smooth scrolling, use the `testreelPage` fixture instead:

```js
recorded('polished demo', async ({ testreelPage }) => {
  await testreelPage.navigate('https://myapp.com')
  await testreelPage.click('.feature-button')
  await testreelPage.zoom({ selector: '.hero', scale: 2.5, duration: 800 })
  await testreelPage.wait(1500)
  await testreelPage.screenshot('zoomed')
  await testreelPage.zoom({ scale: 1, duration: 600 })
})
```

The `testreelPage` object provides these methods:

| Method | Description |
|--------|-------------|
| `click(selector, options?)` | Click an element with animated cursor. Options: `{ timeout }` |
| `type(selector, text, options?)` | Type text with animated cursor. Options: `{ delay, clear, timeout }` |
| `fill(selector, text, options?)` | Set an input's value directly. Options: `{ timeout }` |
| `hover(selector, options?)` | Hover with animated cursor. Options: `{ timeout }` |
| `scroll(options?)` | Smooth scroll with easing. Options: `{ x, y, scrollSpeed }` |
| `zoom(options)` | Zoom to a target. Options: `{ selector, scale, x, y, duration }` |
| `screenshot(name?)` | Take a named screenshot |
| `keyboard(key)` | Press a keyboard key |
| `navigate(url)` | Navigate to a URL |
| `wait(ms?)` | Wait for a duration (default: 1000ms) |
| `stop()` | Stop recording and run post-processing (called automatically by the fixture) |

All selector-based actions include cursor movement and click ripple effects by default.

### Configuring options

Pass options via `playwright.config.ts` using the `testreelOptions` fixture:

```js
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  use: {
    testreelOptions: {
      viewport: { width: 1280, height: 720 },
      scale: 2,
      chrome: { url: true },
      background: {
        gradient: { from: '#667eea', to: '#764ba2' },
        padding: 60,
        borderRadius: 12,
      },
      cursor: { style: 'pointer' },
      outputFormat: 'webm',
    },
  },
})
```

Or override per-test:

```js
recorded.use({
  testreelOptions: {
    scale: 1,
    chrome: false,
    background: false,
  },
})

recorded('lightweight recording', async ({ page }) => {
  // ...
})
```

### Test failures

If a test fails, the fixture still finalizes whatever video has been captured. The partial recording is attached to the test report, which is useful for debugging.

## recordPage API

For scripts outside of Playwright Test, or when you need full control over the browser lifecycle:

```js
import { chromium } from 'playwright-core'
import { recordPage } from 'testreel'

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 2,
  recordVideo: {
    dir: './output',
    size: { width: 2560, height: 1440 }, // viewport × scale
  },
})
const page = await context.newPage()
await page.goto('https://myapp.com')

const recorder = await recordPage(page, {
  outputDir: './output',
  scale: 2,
  chrome: { url: 'https://myapp.com' },
  background: { color: '#6366f1', padding: 60 },
})

await recorder.click('.feature-button')
await recorder.type('#search', 'hello world')
await recorder.screenshot('search-results')

const result = await recorder.stop()
console.log(result.video)       // path to processed .webm
console.log(result.screenshots) // array of screenshot paths

await browser.close()
```

### Important: context lifecycle

`stop()` closes the browser **context** (not the browser) to finalize the video. The page is unusable after `stop()`. If you need to continue using the browser, create a new context.

Calling `stop()` twice throws an error.

## RecordPageOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `outputDir` | `string` | `'./testreel-output'` | Directory for output files |
| `cursor` | `boolean \| CursorOptions` | `true` | Animated cursor overlay |
| `chrome` | `boolean \| WindowChromeOptions` | `false` | macOS-style window chrome |
| `background` | `boolean \| BackgroundOptions` | `false` | Background padding and styling |
| `speed` | `number` | `1.0` | Playback speed multiplier |
| `outputFormat` | `'webm' \| 'mp4' \| 'gif'` | `'webm'` | Video output format |
| `scale` | `number` | `1` | Device scale factor (must match context's `deviceScaleFactor`) |
| `keepIntermediates` | `boolean` | `false` | Keep cursor JSON and intermediate files |

See [Recording Definitions](recording-definitions.md) for details on cursor, chrome, and background options.
