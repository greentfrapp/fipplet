import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadDefinition } from '../validation'

const validDef = {
  url: 'https://example.com',
  steps: [{ action: 'wait', ms: 100 }],
}

describe('loadDefinition', () => {
  describe('from object', () => {
    it('accepts a valid minimal definition', () => {
      const result = loadDefinition(validDef)
      expect(result.url).toBe('https://example.com')
      expect(result.steps).toHaveLength(1)
    })

    it('accepts a definition with all step types', () => {
      const def = {
        url: 'https://example.com',
        steps: [
          { action: 'wait', ms: 500 },
          { action: 'click', selector: '#btn' },
          { action: 'type', selector: '#input', text: 'hello' },
          { action: 'clear', selector: '#input' },
          { action: 'fill', selector: '#input', text: 'world' },
          { action: 'select', selector: '#dropdown', value: 'opt1' },
          { action: 'scroll', y: 100 },
          { action: 'hover', selector: '#link' },
          { action: 'keyboard', key: 'Enter' },
          { action: 'navigate', url: 'https://other.com' },
          { action: 'screenshot', name: 'snap' },
          { action: 'zoom', scale: 2 },
        ],
      }
      const result = loadDefinition(def)
      expect(result.steps).toHaveLength(12)
    })

    it('throws when url is missing', () => {
      expect(() => loadDefinition({ steps: [{ action: 'wait' }] })).toThrow(
        "'url' field",
      )
    })

    it('throws when steps is missing', () => {
      expect(() => loadDefinition({ url: 'https://example.com' })).toThrow(
        "'steps' array",
      )
    })

    it('throws when steps is empty', () => {
      expect(() =>
        loadDefinition({ url: 'https://example.com', steps: [] }),
      ).toThrow("'steps' array")
    })

    it('throws for unknown action', () => {
      expect(() =>
        loadDefinition({
          url: 'https://example.com',
          steps: [{ action: 'explode' }],
        }),
      ).toThrow("unknown action 'explode'")
    })

    it('throws when step is missing action field', () => {
      expect(() =>
        loadDefinition({
          url: 'https://example.com',
          steps: [{ selector: '#btn' }],
        }),
      ).toThrow("missing 'action' field")
    })
  })

  describe('selector-required actions', () => {
    const selectorActions = ['click', 'type', 'clear', 'fill', 'select', 'hover']

    for (const action of selectorActions) {
      it(`throws when '${action}' is missing selector`, () => {
        const steps: Record<string, unknown>[] = [{ action }]
        // Add text for type/fill to isolate the selector check
        if (action === 'type' || action === 'fill') {
          steps[0].text = 'hello'
        }
        if (action === 'select') {
          steps[0].value = 'opt'
        }
        expect(() =>
          loadDefinition({ url: 'https://example.com', steps }),
        ).toThrow("missing required 'selector' field")
      })
    }
  })

  describe('text-required actions', () => {
    for (const action of ['type', 'fill']) {
      it(`throws when '${action}' is missing text`, () => {
        expect(() =>
          loadDefinition({
            url: 'https://example.com',
            steps: [{ action, selector: '#input' }],
          }),
        ).toThrow("missing required 'text' field")
      })
    }
  })

  it('throws when keyboard step is missing key', () => {
    expect(() =>
      loadDefinition({
        url: 'https://example.com',
        steps: [{ action: 'keyboard' }],
      }),
    ).toThrow("missing required 'key' field")
  })

  it('throws when navigate step is missing url', () => {
    expect(() =>
      loadDefinition({
        url: 'https://example.com',
        steps: [{ action: 'navigate' }],
      }),
    ).toThrow("missing required 'url' field")
  })

  describe('from file path', () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fipplet-test-'))
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('loads a valid JSON file', () => {
      const filePath = path.join(tmpDir, 'recording.json')
      fs.writeFileSync(filePath, JSON.stringify(validDef))
      const result = loadDefinition(filePath)
      expect(result.url).toBe('https://example.com')
    })

    it('throws for non-existent file', () => {
      expect(() => loadDefinition('/tmp/does-not-exist-xyz.json')).toThrow(
        'Failed to read',
      )
    })

    it('throws for invalid JSON', () => {
      const filePath = path.join(tmpDir, 'bad.json')
      fs.writeFileSync(filePath, 'not json{{{')
      expect(() => loadDefinition(filePath)).toThrow('Failed to parse')
    })
  })
})
