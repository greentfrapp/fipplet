import fs from 'fs'
import { ACTIONS } from './actions'
import type { RecordingDefinition } from './types'

const ENV_VAR_PATTERN = /\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g

function substituteEnvVars(value: string): string {
  return value.replace(ENV_VAR_PATTERN, (match, braced, bare) => {
    const name = braced ?? bare
    const resolved = process.env[name]
    if (resolved === undefined) {
      throw new Error(`Environment variable '${name}' is not set (referenced as '${match}')`)
    }
    return resolved
  })
}

function substituteDeep<T>(obj: T): T {
  if (typeof obj === 'string') {
    return substituteEnvVars(obj) as T
  }
  if (Array.isArray(obj)) {
    return obj.map(substituteDeep) as T
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteDeep(value)
    }
    return result as T
  }
  return obj
}

export function loadDefinition(input: string | object): RecordingDefinition {
  let def: RecordingDefinition

  if (typeof input === 'string') {
    let raw: string
    try {
      raw = fs.readFileSync(input, 'utf-8')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to read recording definition '${input}': ${msg}`)
    }
    try {
      def = JSON.parse(raw)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to parse recording definition '${input}' as JSON: ${msg}`)
    }
  } else {
    def = input as RecordingDefinition
  }

  def = substituteDeep(def)

  if (!def.url) {
    throw new Error("Recording definition must include a 'url' field")
  }

  if (!Array.isArray(def.steps) || def.steps.length === 0) {
    throw new Error(
      "Recording definition must include a non-empty 'steps' array",
    )
  }

  const selectorRequired = new Set(['click', 'type', 'clear', 'fill', 'select', 'hover'])
  const textRequired = new Set(['type', 'fill'])

  for (const [i, step] of def.steps.entries()) {
    if (!step.action) {
      throw new Error(`Step ${i} missing 'action' field`)
    }
    if (!ACTIONS[step.action]) {
      throw new Error(`Step ${i}: unknown action '${step.action}'`)
    }
    if (selectorRequired.has(step.action) && !('selector' in step && step.selector)) {
      throw new Error(`Step ${i} ('${step.action}'): missing required 'selector' field`)
    }
    if (textRequired.has(step.action) && !('text' in step && step.text !== undefined)) {
      throw new Error(`Step ${i} ('${step.action}'): missing required 'text' field`)
    }
    if (step.action === 'keyboard' && !('key' in step && step.key)) {
      throw new Error(`Step ${i} ('keyboard'): missing required 'key' field`)
    }
    if (step.action === 'navigate' && !('url' in step && step.url)) {
      throw new Error(`Step ${i} ('navigate'): missing required 'url' field`)
    }
  }

  return def
}
