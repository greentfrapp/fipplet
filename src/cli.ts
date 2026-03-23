import { Command } from 'commander'
import { record } from './recorder'
import { login } from './login'
import { loadDefinition, loadSetup } from './validation'
import { setLogLevel } from './logger'
import type { OutputFormat, SetupBlock } from './types'

declare const __FIPPLET_VERSION__: string

const program = new Command()
  .name('fipplet')
  .description('Programmatic video recordings for web apps')
  .version(__FIPPLET_VERSION__, '-v, --version')

// --- Recording command (default) ---
program
  .argument('<definition>', 'Path to a recording definition file (.json, .jsonc, .yaml, .yml)')
  .option('-o, --output <dir>', 'Output directory', './fipplet-output')
  .option('--setup <file>', 'Setup file (login, dismiss modals, etc.) — runs before recording')
  .option('--format <fmt>', 'Output format: webm, mp4, gif')
  .option('--speed <n>', 'Playback speed multiplier')
  .option('--headed', 'Run browser in headed mode')
  .option('--dry-run', 'Validate definition and print summary without launching a browser')
  .option('--verbose', 'Enable detailed output (per-step timing, diagnostics)')
  .option('--quiet', 'Suppress all output except errors and final output paths')
  .action(async (defPath: string, opts: {
    output: string
    setup?: string
    format?: string
    speed?: string
    headed?: boolean
    dryRun?: boolean
    verbose?: boolean
    quiet?: boolean
  }) => {
    // Set log level
    if (opts.verbose && opts.quiet) {
      console.error('Error: --verbose and --quiet are mutually exclusive')
      process.exit(1)
    }
    if (opts.verbose) setLogLevel('verbose')
    if (opts.quiet) setLogLevel('quiet')

    // Validate --format
    let outputFormat: OutputFormat | undefined
    if (opts.format) {
      if (opts.format !== 'webm' && opts.format !== 'mp4' && opts.format !== 'gif') {
        console.error(`Error: --format must be one of: webm, mp4, gif (got '${opts.format}')`)
        process.exit(1)
      }
      outputFormat = opts.format
    }

    // Validate --speed
    let speed: number | undefined
    if (opts.speed) {
      speed = parseFloat(opts.speed)
      if (isNaN(speed) || speed <= 0) {
        console.error('Error: --speed must be a number greater than 0')
        process.exit(1)
      }
    }

    // Load and validate definition
    let def
    try {
      def = loadDefinition(defPath)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`Error: ${msg}`)
      process.exit(1)
    }

    // Load external setup file if provided
    let setup: SetupBlock | undefined
    if (opts.setup) {
      try {
        setup = loadSetup(opts.setup)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`Error: ${msg}`)
        process.exit(1)
      }
    }

    // --- Dry run: print summary and exit ---
    if (opts.dryRun) {
      const hasSetup = setup ?? def.setup
      const selectors = new Set<string>()
      const actions = new Map<string, number>()

      for (const step of def.steps) {
        actions.set(step.action, (actions.get(step.action) ?? 0) + 1)
        if ('selector' in step && step.selector) {
          selectors.add(step.selector as string)
        }
      }

      if (hasSetup) {
        for (const step of hasSetup.steps) {
          if ('selector' in step && step.selector) {
            selectors.add(step.selector as string)
          }
        }
      }

      // Collect env vars referenced in the original file
      const envVarsUsed = new Set<string>()
      try {
        const fs = await import('fs')
        const raw = fs.readFileSync(defPath, 'utf-8')
        const envPattern = /\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g
        let match
        while ((match = envPattern.exec(raw)) !== null) {
          const name = match[1] ?? match[2]
          // Skip JSON Schema $schema references
          if (name === 'schema') continue
          envVarsUsed.add(name)
        }
      } catch {
        // ignore — env var scanning is best-effort
      }

      console.log('Definition valid ✓\n')
      console.log(`  URL:        ${def.url}`)
      console.log(`  Viewport:   ${def.viewport ? `${def.viewport.width}×${def.viewport.height}` : '1280×720 (default)'}`)
      console.log(`  Steps:      ${def.steps.length}`)
      if (hasSetup) {
        console.log(`  Setup:      ${hasSetup.steps.length} step(s)${hasSetup.url ? ` → ${hasSetup.url}` : ''}`)
      }
      console.log(`  Actions:    ${[...actions.entries()].map(([a, n]) => `${a}(${n})`).join(', ')}`)
      if (selectors.size > 0) {
        console.log(`  Selectors:  ${selectors.size} unique`)
        for (const sel of selectors) {
          console.log(`              ${sel}`)
        }
      }
      if (envVarsUsed.size > 0) {
        console.log(`  Env vars:   ${[...envVarsUsed].join(', ')}`)
      }
      if (def.auth) {
        console.log(`  Auth:       ${def.auth.provider}`)
      }
      if (def.cursor !== undefined) {
        console.log(`  Cursor:     ${typeof def.cursor === 'boolean' ? def.cursor : 'custom'}`)
      }
      if (def.chrome) {
        console.log(`  Chrome:     enabled`)
      }
      if (def.background) {
        console.log(`  Background: enabled`)
      }
      if (def.speed) {
        console.log(`  Speed:      ${def.speed}×`)
      }
      if (def.outputFormat) {
        console.log(`  Format:     ${def.outputFormat}`)
      }

      process.exit(0)
    }

    // --- Normal recording ---
    const hasSetup = setup ?? def.setup
    if (!opts.quiet) {
      if (hasSetup) {
        console.log(`fipplet: ${hasSetup.steps.length} setup steps + ${def.steps.length} recording steps → ${def.url}\n`)
      } else {
        console.log(`fipplet: ${def.steps.length} steps → ${def.url}\n`)
      }
    }

    try {
      const result = await record(defPath, {
        outputDir: opts.output,
        headless: !opts.headed,
        setup,
        outputFormat,
        speed,
      })

      if (!opts.quiet) {
        console.log('\nDone!')
      }
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
  })

// --- Login subcommand ---
program
  .command('login <url>')
  .description('Open a browser to log in manually, then save session state')
  .requiredOption('--save-state <file>', 'Path to save the exported session state')
  .option('--channel <name>', 'Browser channel (e.g. "chrome") — use for OAuth providers that block Chromium')
  .option('--cdp <url>', 'Connect to an existing browser via CDP')
  .option('--remote', 'Launch headless browser with web-based viewer')
  .option('--port <number>', 'Viewer port for --remote mode (default: 9222)')
  .action(async (url: string, opts: {
    saveState: string
    channel?: string
    cdp?: string
    remote?: boolean
    port?: string
  }) => {
    if (opts.remote && opts.cdp) {
      console.error('Error: --remote and --cdp are mutually exclusive')
      process.exit(1)
    }

    let port: number | undefined
    if (opts.port) {
      port = parseInt(opts.port, 10)
      if (isNaN(port)) {
        console.error('Error: --port must be a number')
        process.exit(1)
      }
    }

    try {
      await login({
        url,
        saveState: opts.saveState,
        channel: opts.channel,
        cdpUrl: opts.cdp,
        remote: opts.remote,
        port,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`Error: ${msg}`)
      process.exit(1)
    }
  })

program.parse()
