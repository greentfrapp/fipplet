import { record } from './recorder'
import { login } from './login'
import { loadDefinition, loadSetup } from './validation'
import type { SetupBlock } from './types'

const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(`fipplet — programmatic video recordings for web apps

Usage:
  fipplet <recording.json> [options]
  fipplet login <url> --save-state <file>

Commands:
  login             Open a browser to log in manually, then save session state

Recording options:
  --output <dir>    Output directory (default: ./fipplet-output)
  --setup <file>    Setup file (login, dismiss modals, etc.) — runs before recording
  --headed          Run browser in headed mode
  --help, -h        Show this help message
  --version, -v     Show version

Login options:
  --save-state <file>  Path to save the exported session state (required)
  --channel <name>     Browser channel (e.g. "chrome") — use for OAuth providers that block Chromium
  --cdp <url>          Connect to an existing browser via CDP (avoids automation detection entirely)
  --remote             Launch headless browser with web-based viewer (for SSH/headless environments)
  --port <number>      Viewer port for --remote mode (default: 9222)

Examples:
  fipplet recording.json
  fipplet recording.json --output ./demo-output
  fipplet recording.json --setup login.json
  fipplet recording.json --headed
  fipplet login https://app.example.com --save-state ./state.json`)
  process.exit(0)
}

if (args.includes('--version') || args.includes('-v')) {
  declare const __FIPPLET_VERSION__: string
  console.log(__FIPPLET_VERSION__)
  process.exit(0)
}

// --- Login subcommand ---
if (args[0] === 'login') {
  let loginUrl: string | null = null
  let saveStatePath: string | null = null
  let channel: string | undefined
  let cdpUrl: string | undefined
  let remote = false
  let port: number | undefined

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--save-state') {
      saveStatePath = args[++i]
    } else if (args[i] === '--channel') {
      channel = args[++i]
    } else if (args[i] === '--cdp') {
      cdpUrl = args[++i]
    } else if (args[i] === '--remote') {
      remote = true
    } else if (args[i] === '--port') {
      port = parseInt(args[++i], 10)
      if (isNaN(port)) {
        console.error('Error: --port must be a number')
        process.exit(1)
      }
    } else if (!args[i].startsWith('-')) {
      loginUrl = args[i]
    }
  }

  if (!loginUrl) {
    console.error('Error: no URL specified for login')
    console.error('Usage: fipplet login <url> --save-state <file>')
    process.exit(1)
  }

  if (!saveStatePath) {
    console.error('Error: --save-state <file> is required')
    console.error('Usage: fipplet login <url> --save-state <file>')
    process.exit(1)
  }

  if (remote && cdpUrl) {
    console.error('Error: --remote and --cdp are mutually exclusive')
    process.exit(1)
  }

  login({ url: loginUrl, saveState: saveStatePath, channel, cdpUrl, remote, port }).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`Error: ${msg}`)
    process.exit(1)
  })
} else {
  // --- Recording command ---
  let defPath: string | null = null
  let outputDir = './fipplet-output'
  let setupPath: string | null = null
  let headless = true

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' || args[i] === '-o') {
      outputDir = args[++i]
    } else if (args[i] === '--setup') {
      setupPath = args[++i]
    } else if (args[i] === '--headed') {
      headless = false
    } else if (!args[i].startsWith('-')) {
      defPath = args[i]
    }
  }

  if (!defPath) {
    console.error('Error: no recording definition file specified')
    console.error('Run `fipplet --help` for usage')
    process.exit(1)
  }

  async function main() {
    const def = loadDefinition(defPath!)

    // Load external setup file if provided (takes precedence over inline setup)
    let setup: SetupBlock | undefined
    if (setupPath) {
      setup = loadSetup(setupPath)
    }

    const hasSetup = setup ?? def.setup
    if (hasSetup) {
      console.log(`fipplet: ${hasSetup.steps.length} setup steps + ${def.steps.length} recording steps → ${def.url}\n`)
    } else {
      console.log(`fipplet: ${def.steps.length} steps → ${def.url}\n`)
    }

    const result = await record(defPath!, { outputDir, headless, setup })

    console.log('\nDone!')
    if (result.video) {
      console.log(`  Video: ${result.video}`)
    }
    if (result.screenshots.length > 0) {
      console.log(`  Screenshots: ${result.screenshots.length} file(s)`)
    }
  }

  main().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`Error: ${msg}`)
    process.exit(1)
  })
}
