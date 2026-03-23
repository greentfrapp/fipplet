import fs from 'fs'
import { loadDefinition, loadSetup } from './validation'
import type { SetupBlock } from './types'

/**
 * Validate a recording definition and print a summary.
 * Used by both `--dry-run` and the `validate` subcommand.
 */
export function runValidate(defPath: string, opts: { setup?: string, quiet?: boolean } = {}): void {
  let def
  try {
    def = loadDefinition(defPath)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`Error: ${msg}`)
    process.exit(1)
  }

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

  if (opts.quiet) {
    // Quiet mode: just validate, no output on success
    process.exit(0)
  }

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
    const raw = fs.readFileSync(defPath, 'utf-8')
    const envPattern = /\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g
    let match
    while ((match = envPattern.exec(raw)) !== null) {
      const name = match[1] ?? match[2]
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
