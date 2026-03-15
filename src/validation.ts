import fs from 'fs'
import { ACTIONS } from './actions'
import type { RecordingDefinition } from './types'

export function loadDefinition(input: string | object): RecordingDefinition {
  let def: RecordingDefinition

  if (typeof input === 'string') {
    const raw = fs.readFileSync(input, 'utf-8')
    def = JSON.parse(raw)
  } else {
    def = input as RecordingDefinition
  }

  if (!def.url) {
    throw new Error("Recording definition must include a 'url' field")
  }

  if (!Array.isArray(def.steps) || def.steps.length === 0) {
    throw new Error(
      "Recording definition must include a non-empty 'steps' array",
    )
  }

  for (const [i, step] of def.steps.entries()) {
    if (!step.action) {
      throw new Error(`Step ${i} missing 'action' field`)
    }
    if (!ACTIONS[step.action]) {
      throw new Error(`Step ${i}: unknown action '${step.action}'`)
    }
  }

  return def
}
