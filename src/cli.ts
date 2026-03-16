import { record } from './recorder'
import { loadDefinition, loadSetup } from './validation'
import type { SetupBlock } from './types'

const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(`fipplet — programmatic video recordings for web apps

Usage:
  fipplet <recording.json> [options]

Options:
  --output <dir>    Output directory (default: ./fipplet-output)
  --setup <file>    Setup file (login, dismiss modals, etc.) — runs before recording
  --headed          Run browser in headed mode
  --help, -h        Show this help message
  --version, -v     Show version

Examples:
  fipplet recording.json
  fipplet recording.json --output ./demo-output
  fipplet recording.json --setup login.json
  fipplet recording.json --headed`)
  process.exit(0)
}

if (args.includes('--version') || args.includes('-v')) {
  declare const __FIPPLET_VERSION__: string
  console.log(__FIPPLET_VERSION__)
  process.exit(0)
}

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
