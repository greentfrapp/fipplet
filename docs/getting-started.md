# Getting Started

## Install

```bash
npm install fipplet playwright
```

Fipplet uses Playwright to drive a real Chromium browser. After installing, make sure Chromium is available:

```bash
npx playwright install chromium
```

## Your first recording

Create a file called `recording.json`:

```json
{
  "url": "https://en.wikipedia.org/wiki/Main_Page",
  "viewport": { "width": 1280, "height": 720 },
  "steps": [
    { "action": "wait", "ms": 1000 },
    { "action": "screenshot", "name": "homepage" },
    { "action": "scroll", "y": 400 },
    { "action": "wait", "ms": 1000 },
    { "action": "screenshot", "name": "scrolled" }
  ]
}
```

Run it:

```bash
npx fipplet recording.json
```

Fipplet will launch a headless browser, navigate to the URL, execute each step, and write the output to `./fipplet-output/`.

## What gets produced

After a recording completes, the output directory contains:

| File | Description |
|------|-------------|
| `recording-<timestamp>.webm` | The screen recording video |
| `homepage.png`, `scrolled.png` | Screenshots from `screenshot` steps |
| `final-<timestamp>.png` | Automatic screenshot of the last frame |
| `output.json` | Manifest with paths to all output files |

## Debugging with headed mode

To watch the recording happen in a visible browser window:

```bash
npx fipplet recording.json --headed
```

## Validate without recording

Check that your definition is valid without launching a browser:

```bash
npx fipplet recording.json --dry-run
# or
npx fipplet validate recording.json
```

## Using the API

Fipplet can also be used as a library:

```js
import { record, loadDefinition } from 'fipplet'

const def = loadDefinition('recording.json')
const result = await record(def, { outputDir: './output' })

console.log(result.video)       // path to .webm file
console.log(result.screenshots) // array of .png paths
```

## Next steps

- [Recording Definitions](recording-definitions.md) — full reference for the JSON format
- [Actions](actions.md) — all 13 step actions with examples
- [Authentication](authentication.md) — recording authenticated apps
- [CLI Reference](cli.md) — all commands and flags
- [Examples](examples.md) — common recording patterns
