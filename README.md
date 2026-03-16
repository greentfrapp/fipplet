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
  fipplet login <url> --save-state <file>

Recording options:
  --output <dir>       Output directory (default: ./fipplet-output)
  --setup <file>       Setup file (login steps, etc.) — runs before recording
  --headed             Run browser in headed mode (visible window)
  --help, -h           Show help message
  --version, -v        Show version

Login options:
  --save-state <file>  Path to save the exported session state (required)
  --channel <name>     Browser channel (e.g. "chrome") — for OAuth providers that block Chromium
  --cdp <url>          Connect to an existing browser via CDP
```

```bash
# Run a recording
npx fipplet recording.json

# Save output to a specific directory
npx fipplet recording.json --output ./demo-output

# Watch the recording happen in a visible browser window (useful for debugging)
npx fipplet recording.json --headed

# Use setup steps from a separate file
npx fipplet recording.json --setup login.json
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
| `setup` | `{ url?, steps }` | — | Steps to run before recording (e.g. login) |
| `steps` | `Step[]` | *required* | Array of actions to execute |

## Login & authentication

Most web apps require authentication. Fipplet supports several approaches so your recordings start in a logged-in state without capturing the login flow on video.

### Setup block (recommended)

The `setup` block runs steps **before** video recording starts. Session state (cookies, localStorage, etc.) is automatically carried over into the recorded session.

```json
{
  "url": "https://app.example.com/dashboard",
  "setup": {
    "url": "https://app.example.com/login",
    "steps": [
      { "action": "fill", "selector": "#email", "text": "user@example.com" },
      { "action": "fill", "selector": "#password", "text": "s3cret" },
      { "action": "click", "selector": "button[type=submit]" },
      { "action": "wait", "ms": 2000 }
    ]
  },
  "steps": [
    { "action": "screenshot", "name": "dashboard" }
  ]
}
```

The setup block accepts an optional `url` (defaults to the main `url`) and an array of `steps` using the same actions as the recording.

### localStorage injection

For apps that store auth tokens in localStorage (e.g. Supabase, Firebase):

```json
{
  "url": "https://app.example.com",
  "localStorage": {
    "sb-auth-token": "{\"access_token\":\"eyJ...\",\"refresh_token\":\"abc\"}"
  },
  "steps": [...]
}
```

Fipplet navigates to the URL, injects the entries, then reloads to let the app pick up the session.

### Cookies

```json
{
  "url": "https://app.example.com",
  "cookies": [
    {
      "name": "session",
      "value": "abc123",
      "domain": "app.example.com",
      "path": "/"
    }
  ],
  "steps": [...]
}
```

### Interactive login (`fipplet login`)

For OAuth flows or other logins that are hard to automate, use the `login` subcommand. It opens a real browser, lets you log in manually, and exports the session state to a JSON file.

```bash
# Open a browser, log in, then close the window to save
npx fipplet login https://app.example.com --save-state ./state.json

# Use Chrome instead of Chromium (needed for Google OAuth and other providers
# that block automation-controlled browsers)
npx fipplet login https://app.example.com --save-state ./state.json --channel chrome

# Connect to an already-running browser via CDP (avoids automation detection entirely)
npx fipplet login https://app.example.com --save-state ./state.json --cdp http://localhost:9222
```

Then reference the saved state in your recording definition:

```json
{
  "url": "https://app.example.com",
  "storageState": "./state.json",
  "steps": [...]
}
```

### Playwright storage state

If you have an existing Playwright `storageState` JSON file (from `context.storageState()`), point to it directly:

```json
{
  "url": "https://app.example.com",
  "storageState": "./auth-state.json",
  "steps": [...]
}
```

### Extra headers

For APIs or apps that accept auth headers (e.g. Bearer tokens):

```json
{
  "url": "https://app.example.com",
  "headers": {
    "Authorization": "Bearer eyJ..."
  },
  "steps": [...]
}
```

These methods can be combined — for example, using `localStorage` for auth tokens alongside a `setup` block that navigates past an onboarding screen.

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
