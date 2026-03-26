import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runValidate } from '../validate-command'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testreel-validate-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

function writeDefFile(name: string, content: object): string {
  const filePath = path.join(tmpDir, name)
  fs.writeFileSync(filePath, JSON.stringify(content))
  return filePath
}

describe('runValidate', () => {
  it('prints summary for a valid definition', () => {
    const filePath = writeDefFile('good.json', {
      url: 'https://example.com',
      steps: [
        { action: 'click', selector: '#btn' },
        { action: 'wait', ms: 500 },
      ],
    })

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    expect(() => runValidate(filePath)).toThrow('exit')
    expect(exitSpy).toHaveBeenCalledWith(0)

    const output = logSpy.mock.calls.map((c) => c[0]).join('\n')
    expect(output).toContain('Definition valid')
    expect(output).toContain('https://example.com')
    expect(output).toContain('Steps:      2')
    expect(output).toContain('click(1)')
    expect(output).toContain('wait(1)')
    expect(output).toContain('#btn')
  })

  it('exits 1 for an invalid definition', () => {
    const filePath = writeDefFile('bad.json', { bad: true })

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => runValidate(filePath)).toThrow('exit')
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(errSpy.mock.calls[0][0]).toContain('Error:')
  })

  it('quiet mode exits 0 without printing summary', () => {
    const filePath = writeDefFile('good.json', {
      url: 'https://example.com',
      steps: [{ action: 'wait' }],
    })

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    expect(() => runValidate(filePath, { quiet: true })).toThrow('exit')
    expect(exitSpy).toHaveBeenCalledWith(0)
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('validates setup file when provided', () => {
    const defPath = writeDefFile('def.json', {
      url: 'https://example.com',
      steps: [{ action: 'wait' }],
    })
    const setupPath = writeDefFile('setup.json', {
      steps: [{ action: 'click', selector: '.dismiss' }],
    })

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    expect(() => runValidate(defPath, { setup: setupPath })).toThrow('exit')
    expect(exitSpy).toHaveBeenCalledWith(0)

    const output = logSpy.mock.calls.map((c) => c[0]).join('\n')
    expect(output).toContain('Setup:')
    expect(output).toContain('.dismiss')
  })

  it('exits 1 when setup file is invalid', () => {
    const defPath = writeDefFile('def.json', {
      url: 'https://example.com',
      steps: [{ action: 'wait' }],
    })
    const setupPath = writeDefFile('bad-setup.json', { steps: [] })

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => runValidate(defPath, { setup: setupPath })).toThrow('exit')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('shows auth provider in summary', () => {
    const filePath = writeDefFile('auth.json', {
      url: 'https://example.com',
      auth: {
        provider: 'supabase',
        url: 'https://sb.example.com',
        serviceRoleKey: 'key',
        email: 'test@test.com',
      },
      steps: [{ action: 'wait' }],
    })

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    expect(() => runValidate(filePath)).toThrow('exit')
    expect(exitSpy).toHaveBeenCalledWith(0)

    const output = logSpy.mock.calls.map((c) => c[0]).join('\n')
    expect(output).toContain('Auth:       supabase')
  })

  it('shows viewport dimensions in summary', () => {
    const filePath = writeDefFile('viewport.json', {
      url: 'https://example.com',
      viewport: { width: 1920, height: 1080 },
      steps: [{ action: 'wait' }],
    })

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    expect(() => runValidate(filePath)).toThrow('exit')

    const output = logSpy.mock.calls.map((c) => c[0]).join('\n')
    expect(output).toContain('1920×1080')
  })

  it('shows default viewport when not specified', () => {
    const filePath = writeDefFile('novp.json', {
      url: 'https://example.com',
      steps: [{ action: 'wait' }],
    })

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    expect(() => runValidate(filePath)).toThrow('exit')

    const output = logSpy.mock.calls.map((c) => c[0]).join('\n')
    expect(output).toContain('1280×720 (default)')
  })

  it('detects env vars in definition file', () => {
    const filePath = path.join(tmpDir, 'envvars.json')
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        url: '${BASE_URL}/app',
        steps: [{ action: 'wait' }],
      }),
    )

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    // Set env var so loadDefinition doesn't fail on substitution
    process.env.BASE_URL = 'https://example.com'
    try {
      expect(() => runValidate(filePath)).toThrow('exit')
    } finally {
      delete process.env.BASE_URL
    }

    const output = logSpy.mock.calls.map((c) => c[0]).join('\n')
    expect(output).toContain('Env vars:')
    expect(output).toContain('BASE_URL')
  })
})
