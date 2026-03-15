# fipplet

Programmatic video recordings for web apps. Define interactions in JSON, get polished screen recordings out.

## Install

```bash
npm install fipplet playwright
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

### CLI

```
Usage:
  fipplet <recording.json> [options]

Options:
  --output <dir>    Output directory (default: ./fipplet-output)
  --headed          Run browser in headed mode (visible window)
  --help, -h        Show help message
  --version, -v     Show version
```

```bash
# Run a recording
npx fipplet recording.json

# Save output to a specific directory
npx fipplet recording.json --output ./demo-output

# Watch the recording happen in a visible browser window (useful for debugging)
npx fipplet recording.json --headed
```

### API

```js
import { record, loadDefinition } from 'fipplet'

const def = loadDefinition('recording.json')
const result = await record(def, { outputDir: './output' })

console.log(result.video)       // path to .webm file
console.log(result.screenshots) // array of .png paths
```

## Recording definition

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `url` | `string` | *required* | Target page URL |
| `viewport` | `{ width, height }` | `1280x720` | Browser viewport size |
| `colorScheme` | `"light" \| "dark"` | `"light"` | Preferred color scheme |
| `waitForSelector` | `string` | — | CSS selector to await before starting |
| `storageState` | `string` | — | Path to Playwright storage state JSON |
| `cookies` | `Cookie[]` | — | Cookies to set before navigation |
| `localStorage` | `Record<string, string>` | — | localStorage entries to set |
| `headers` | `Record<string, string>` | — | Extra HTTP headers |
| `steps` | `Step[]` | *required* | Array of actions to execute |

## Actions

Every step has an `action` field and an optional `pauseAfter` (ms, default 500) that controls the delay before the next step.

| Action | Fields | Description |
|--------|--------|-------------|
| `wait` | `ms?` (default 1000) | Pause execution |
| `click` | `selector` | Click an element |
| `type` | `selector`, `text`, `delay?` (default 80), `clear?` | Type text character-by-character |
| `fill` | `selector`, `text` | Set input value instantly |
| `clear` | `selector` | Clear an input field |
| `select` | `selector`, `value` | Select a dropdown option |
| `scroll` | `x?`, `y?` | Scroll the page |
| `hover` | `selector` | Hover over an element |
| `keyboard` | `key` | Press a keyboard key |
| `navigate` | `url` | Navigate to a new URL |
| `screenshot` | `name?`, `fullPage?` | Capture a PNG screenshot |
| `zoom` | `selector?`, `scale?`, `x?`, `y?`, `duration?` | Zoom into a region with CSS transform |

## Output

Recordings produce:

- **Video:** a WebM file captured by Playwright's built-in video recording
- **Screenshots:** PNGs from any `screenshot` steps, plus a final frame
- All output goes to the `--output` directory (default `./fipplet-output`)

## License

[MIT](LICENSE)
