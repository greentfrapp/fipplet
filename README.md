# fipplet

Programmatic video recordings for web apps. Define interactions in JSON, get polished screen recordings out.

## Install

```bash
npm install fipplet playwright
npx playwright install chromium
```

## Quick start

Create a recording definition (`recording.json`):

```json
{
  "url": "https://example.com",
  "viewport": { "width": 1280, "height": 720 },
  "steps": [
    { "action": "click", "selector": "button.sign-in" },
    { "action": "fill", "selector": "#email", "text": "user@example.com" },
    { "action": "screenshot", "name": "filled-form" },
    { "action": "click", "selector": "button[type=submit]" },
    { "action": "wait", "ms": 2000 }
  ]
}
```

Run it:

```bash
npx fipplet recording.json
```

Output goes to `./fipplet-output/` — a WebM video, PNG screenshots, and an `output.json` manifest.

### CLI

```bash
npx fipplet recording.json                       # basic recording
npx fipplet recording.json --headed              # visible browser
npx fipplet recording.json --format gif          # GIF output
npx fipplet recording.json --setup login.json    # separate setup file
npx fipplet validate recording.json              # validate without recording
npx fipplet login https://app.com --save-state state.json  # interactive login
npx fipplet init                                 # create a definition interactively
```

### API

```js
import { record, loadDefinition } from 'fipplet'

const def = loadDefinition('recording.json')
const result = await record(def, { outputDir: './output' })

console.log(result.video)       // path to .webm file
console.log(result.screenshots) // array of .png paths
```

### Playwright test fixture

Already have a Playwright test suite? Record polished videos from your existing tests:

```js
import { test, expect } from 'fipplet/playwright'

test('product demo', async ({ fippletPage }) => {
  await fippletPage.navigate('https://myapp.com')
  await fippletPage.click('.login-button')
  await fippletPage.type('#email', 'user@example.com')
  await fippletPage.screenshot('login-form')
  // Video is saved and attached to the test report automatically
})
```

### recordPage API

For manual control over recording within any Playwright script:

```js
import { recordPage } from 'fipplet'

// page must belong to a context created with recordVideo
const recorder = await recordPage(page, { scale: 2, chrome: true })
await recorder.click('.button')
await recorder.type('#search', 'hello')
const result = await recorder.stop() // finalizes video + post-processing
console.log(result.video)
```

## Features

- **13 actions** — click, type, fill, clear, select, scroll, hover, keyboard, navigate, screenshot, zoom, wait, waitForNetwork
- **Animated cursor** — configurable style, size, and click ripple effects
- **Window chrome** — macOS-style title bar with traffic lights
- **Background styling** — padding, rounded corners, solid or gradient backgrounds
- **Multiple auth methods** — setup blocks, localStorage/cookies injection, storage state files, interactive login, Supabase provider
- **Retina/HiDPI** — `scale` option for 2× resolution recording
- **Playwright integration** — test fixture and `recordPage()` API for existing test suites
- **Output formats** — WebM (default), MP4, GIF
- **Speed control** — global and per-step playback speed
- **Environment variables** — `${VAR}` substitution in definitions
- **JSON Schema** — IDE autocomplete via `recording-definition.schema.json`

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/getting-started.md) | Installation, first recording, output explanation |
| [Recording Definitions](docs/recording-definitions.md) | Full reference for the JSON format |
| [Actions](docs/actions.md) | All 13 step actions with examples |
| [Authentication](docs/authentication.md) | Recording authenticated apps |
| [CLI Reference](docs/cli.md) | All commands and flags |
| [Playwright Integration](docs/playwright.md) | Test fixture and `recordPage()` API |
| [Examples](docs/examples.md) | Common recording patterns |

## License

[MIT](LICENSE)
