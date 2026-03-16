import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadDefinition } from './validation'

function minimalDef(overrides: Record<string, unknown> = {}) {
  return {
    url: 'https://example.com',
    steps: [{ action: 'wait', ms: 100 }],
    ...overrides,
  }
}

function writeTempJson(obj: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fipplet-test-'))
  const file = path.join(dir, 'def.json')
  fs.writeFileSync(file, JSON.stringify(obj))
  return file
}

describe('loadDefinition', () => {
  describe('env var substitution', () => {
    const savedEnv: Record<string, string | undefined> = {}

    beforeEach(() => {
      for (const key of ['TEST_URL', 'TEST_TOKEN', 'TEST_KEY', 'MY_VAR']) {
        savedEnv[key] = process.env[key]
      }
    })

    afterEach(() => {
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    })

    it('substitutes $VAR syntax in top-level strings', () => {
      process.env.TEST_URL = 'https://resolved.example.com'
      const def = loadDefinition(minimalDef({ url: '$TEST_URL' }))
      expect(def.url).toBe('https://resolved.example.com')
    })

    it('substitutes ${VAR} syntax in top-level strings', () => {
      process.env.TEST_URL = 'https://resolved.example.com'
      const def = loadDefinition(minimalDef({ url: '${TEST_URL}' }))
      expect(def.url).toBe('https://resolved.example.com')
    })

    it('substitutes env vars embedded in a larger string', () => {
      process.env.TEST_TOKEN = 'abc123'
      const def = loadDefinition(
        minimalDef({ headers: { Authorization: 'Bearer ${TEST_TOKEN}' } }),
      )
      expect(def.headers!.Authorization).toBe('Bearer abc123')
    })

    it('substitutes multiple env vars in the same string', () => {
      process.env.TEST_URL = 'example.com'
      process.env.TEST_TOKEN = 'tok'
      const def = loadDefinition(
        minimalDef({ url: 'https://$TEST_URL/path?t=${TEST_TOKEN}' }),
      )
      expect(def.url).toBe('https://example.com/path?t=tok')
    })

    it('substitutes env vars in localStorage values', () => {
      process.env.TEST_TOKEN = 'session-value'
      const def = loadDefinition(
        minimalDef({ localStorage: { 'auth-token': '$TEST_TOKEN' } }),
      )
      expect(def.localStorage!['auth-token']).toBe('session-value')
    })

    it('substitutes env vars in headers', () => {
      process.env.TEST_KEY = 'key-123'
      const def = loadDefinition(
        minimalDef({ headers: { 'X-Api-Key': '${TEST_KEY}' } }),
      )
      expect(def.headers!['X-Api-Key']).toBe('key-123')
    })

    it('substitutes env vars in step values', () => {
      process.env.MY_VAR = 'hello'
      const def = loadDefinition({
        url: 'https://example.com',
        steps: [{ action: 'fill', selector: '#input', text: '$MY_VAR' }],
      })
      expect(def.steps[0]).toMatchObject({ text: 'hello' })
    })

    it('substitutes env vars in cookie values', () => {
      process.env.TEST_TOKEN = 'cookie-val'
      const def = loadDefinition(
        minimalDef({
          cookies: [
            { name: 'session', value: '$TEST_TOKEN', domain: '.example.com', path: '/' },
          ],
        }),
      )
      expect(def.cookies![0].value).toBe('cookie-val')
    })

    it('throws when an env var is not set ($VAR syntax)', () => {
      delete process.env.NONEXISTENT_VAR
      expect(() =>
        loadDefinition(minimalDef({ url: '$NONEXISTENT_VAR' })),
      ).toThrow("Environment variable 'NONEXISTENT_VAR' is not set")
    })

    it('throws when an env var is not set (${VAR} syntax)', () => {
      delete process.env.NONEXISTENT_VAR
      expect(() =>
        loadDefinition(minimalDef({ url: '${NONEXISTENT_VAR}' })),
      ).toThrow("Environment variable 'NONEXISTENT_VAR' is not set")
    })

    it('leaves strings without env var references unchanged', () => {
      const def = loadDefinition(minimalDef({ url: 'https://example.com' }))
      expect(def.url).toBe('https://example.com')
    })

    it('substitutes env vars with empty string values', () => {
      process.env.TEST_TOKEN = ''
      const def = loadDefinition(minimalDef({ url: 'https://example.com/$TEST_TOKEN' }))
      expect(def.url).toBe('https://example.com/')
    })

    it('works when loading from a JSON file', () => {
      process.env.TEST_TOKEN = 'from-file'
      const file = writeTempJson({
        url: 'https://example.com',
        localStorage: { token: '${TEST_TOKEN}' },
        steps: [{ action: 'wait', ms: 100 }],
      })
      const def = loadDefinition(file)
      expect(def.localStorage!.token).toBe('from-file')
      fs.rmSync(path.dirname(file), { recursive: true })
    })

    it('does not substitute in non-string values', () => {
      const def = loadDefinition(
        minimalDef({ viewport: { width: 1280, height: 720 } }),
      )
      expect(def.viewport).toEqual({ width: 1280, height: 720 })
    })
  })

  describe('existing validation', () => {
    it('throws when url is missing', () => {
      expect(() =>
        loadDefinition({ steps: [{ action: 'wait' }] }),
      ).toThrow("must include a 'url' field")
    })

    it('throws when steps is empty', () => {
      expect(() =>
        loadDefinition({ url: 'https://example.com', steps: [] }),
      ).toThrow("must include a non-empty 'steps' array")
    })

    it('throws for unknown action', () => {
      expect(() =>
        loadDefinition({ url: 'https://example.com', steps: [{ action: 'bogus' }] }),
      ).toThrow("unknown action 'bogus'")
    })

    it('throws when click is missing selector', () => {
      expect(() =>
        loadDefinition({ url: 'https://example.com', steps: [{ action: 'click' }] }),
      ).toThrow("missing required 'selector' field")
    })

    it('throws when fill is missing text', () => {
      expect(() =>
        loadDefinition({
          url: 'https://example.com',
          steps: [{ action: 'fill', selector: '#x' }],
        }),
      ).toThrow("missing required 'text' field")
    })

    it('accepts a valid definition', () => {
      const def = loadDefinition(minimalDef())
      expect(def.url).toBe('https://example.com')
      expect(def.steps).toHaveLength(1)
    })
  })
})
