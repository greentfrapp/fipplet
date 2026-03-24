# Playwright Integration

Fipplet integrates with Playwright in two ways:

1. **Test fixture** (`fipplet/playwright`) — drop-in replacement for Playwright's `test` that automatically records polished videos from your test runs
2. **`recordPage()` API** (`fipplet`) — wrap any existing Playwright `Page` with cursor tracking and post-processing

Use the **fixture** when you want automatic setup/teardown and test report integration. Use **`recordPage()`** when you need manual control or want to integrate into a custom script.

## Test fixture

### Setup

Install fipplet alongside your existing Playwright setup:

```bash
npm install fipplet
```

### Basic usage

Import `test` and `expect` from `fipplet/playwright` instead of `@playwright/test`:

```js
import { test, expect } from 'fipplet/playwright'

test('product demo', async ({ fippletPage }) => {
  await fippletPage.navigate('https://myapp.com')
  await fippletPage.click('.sign-up')
  await fippletPage.type('#email', 'user@example.com', { delay: 60 })
  await fippletPage.fill('#password', 's3cure-password')
  await fippletPage.screenshot('form-filled')
  await fippletPage.click('button[type=submit]')
  await fippletPage.wait(2000)
})
```

The fixture creates a browser context with video recording, wraps the page with cursor tracking, and on teardown:

1. Takes a final screenshot
2. Closes the context (finalizes the video)
3. Runs post-processing (cursor overlay, chrome, background)
4. Attaches the video and screenshots to the test report

### Configuring options

Pass options via `playwright.config.ts` using the `fippletOptions` fixture:

```js
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  use: {
    fippletOptions: {
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
test.use({
  fippletOptions: {
    scale: 1,
    chrome: false,
    background: false,
  },
})

test('lightweight recording', async ({ fippletPage }) => {
  // ...
})
```

### Available actions

The `fippletPage` object provides these methods:

| Method | Description |
|--------|-------------|
| `click(selector, options?)` | Click an element. Options: `{ timeout }` |
| `type(selector, text, options?)` | Type text into an element. Options: `{ delay, clear, timeout }` |
| `fill(selector, text, options?)` | Set an input's value directly. Options: `{ timeout }` |
| `hover(selector, options?)` | Hover over an element. Options: `{ timeout }` |
| `scroll(options?)` | Smooth scroll. Options: `{ x, y, scrollSpeed }` |
| `zoom(options)` | Zoom to a target. Options: `{ selector, scale, x, y, duration }` |
| `screenshot(name?)` | Take a named screenshot |
| `keyboard(key)` | Press a keyboard key |
| `navigate(url)` | Navigate to a URL |
| `wait(ms?)` | Wait for a duration (default: 1000ms) |
| `stop()` | Stop recording and run post-processing (called automatically by the fixture) |

All selector-based actions include cursor movement and click ripple effects by default.

### Test failures

If a test fails, the fixture still finalizes whatever video has been captured. The partial recording is attached to the test report, which is useful for debugging.

## recordPage API

For scripts outside of Playwright Test, or when you need full control over the browser lifecycle:

```js
import { chromium } from 'playwright-core'
import { recordPage } from 'fipplet'

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
| `outputDir` | `string` | `'./fipplet-output'` | Directory for output files |
| `cursor` | `boolean \| CursorOptions` | `true` | Animated cursor overlay |
| `chrome` | `boolean \| WindowChromeOptions` | `false` | macOS-style window chrome |
| `background` | `boolean \| BackgroundOptions` | `false` | Background padding and styling |
| `speed` | `number` | `1.0` | Playback speed multiplier |
| `outputFormat` | `'webm' \| 'mp4' \| 'gif'` | `'webm'` | Video output format |
| `scale` | `number` | `1` | Device scale factor (must match context's `deviceScaleFactor`) |
| `keepIntermediates` | `boolean` | `false` | Keep cursor JSON and intermediate files |

See [Recording Definitions](recording-definitions.md) for details on cursor, chrome, and background options.
