import { record } from './recorder'
import { loadDefinition } from './validation'

const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(`fipplet — programmatic video recordings for web apps

Usage:
  fipplet <recording.json> [options]

Options:
  --output <dir>    Output directory (default: ./fipplet-output)
  --headed          Run browser in headed mode
  --help, -h        Show this help message
  --version, -v     Show version

Examples:
  fipplet recording.json
  fipplet recording.json --output ./demo-output
  fipplet recording.json --headed`)
  process.exit(0)
}

if (args.includes('--version') || args.includes('-v')) {
  const { createRequire } = await import('module')
  const require = createRequire(import.meta.url)
  const pkg = require('../package.json')
  console.log(pkg.version)
  process.exit(0)
}

let defPath: string | null = null
let outputDir = './fipplet-output'
let headless = true

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output' || args[i] === '-o') {
    outputDir = args[++i]
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

try {
  const def = loadDefinition(defPath)
  console.log(`fipplet: ${def.steps.length} steps → ${def.url}\n`)

  const result = await record(defPath, { outputDir, headless })

  console.log('\nDone!')
  if (result.video) {
    console.log(`  Video: ${result.video}`)
  }
  if (result.screenshots.length > 0) {
    console.log(`  Screenshots: ${result.screenshots.length} file(s)`)
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`Error: ${msg}`)
  process.exit(1)
}
