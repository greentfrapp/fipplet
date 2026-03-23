import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  select: vi.fn(),
  confirm: vi.fn(),
}))

import { input, select, confirm } from '@inquirer/prompts'
import { runInit } from '../init'

const mockedInput = vi.mocked(input)
const mockedSelect = vi.mocked(select)
const mockedConfirm = vi.mocked(confirm)

let tmpDir: string
let origCwd: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fipplet-init-'))
  origCwd = process.cwd()
  process.chdir(tmpDir)
})

afterEach(() => {
  process.chdir(origCwd)
  fs.rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

function mockPrompts(overrides: {
  url?: string
  width?: string
  height?: string
  auth?: string
  filename?: string
} = {}) {
  const values = {
    url: 'https://example.com',
    width: '1280',
    height: '720',
    auth: 'none',
    filename: 'recording.json',
    ...overrides,
  }

  let inputCallIndex = 0
  mockedInput.mockImplementation(async () => {
    const responses = [values.url, values.width, values.height, values.filename]
    return responses[inputCallIndex++]
  })
  mockedSelect.mockResolvedValue(values.auth)
  mockedConfirm.mockResolvedValue(true)
}

describe('runInit', () => {
  it('creates a recording definition with no auth', async () => {
    mockPrompts()
    await runInit()

    const outPath = path.join(tmpDir, 'recording.json')
    expect(fs.existsSync(outPath)).toBe(true)

    const def = JSON.parse(fs.readFileSync(outPath, 'utf-8'))
    expect(def.$schema).toBe('https://fipplet.dev/recording-definition.schema.json')
    expect(def.url).toBe('https://example.com')
    expect(def.viewport).toEqual({ width: 1280, height: 720 })
    expect(def.steps).toHaveLength(2)
    expect(def.steps[0]).toMatchObject({ action: 'wait', ms: 1000 })
    expect(def.steps[1]).toMatchObject({ action: 'screenshot', name: 'initial' })
    expect(def.auth).toBeUndefined()
    expect(def.storageState).toBeUndefined()
    expect(def.localStorage).toBeUndefined()
  })

  it('creates a definition with storageState auth', async () => {
    mockPrompts({ auth: 'storageState' })
    await runInit()

    const def = JSON.parse(fs.readFileSync(path.join(tmpDir, 'recording.json'), 'utf-8'))
    expect(def.storageState).toBe('./state.json')
    expect(def.auth).toBeUndefined()
  })

  it('creates a definition with localStorage auth', async () => {
    mockPrompts({ auth: 'localStorage' })
    await runInit()

    const def = JSON.parse(fs.readFileSync(path.join(tmpDir, 'recording.json'), 'utf-8'))
    expect(def.localStorage).toEqual({ 'auth-token': 'YOUR_TOKEN_HERE' })
  })

  it('creates a definition with supabase auth', async () => {
    mockPrompts({ auth: 'supabase' })
    await runInit()

    const def = JSON.parse(fs.readFileSync(path.join(tmpDir, 'recording.json'), 'utf-8'))
    expect(def.auth).toMatchObject({
      provider: 'supabase',
      url: '${SUPABASE_URL}',
      serviceRoleKey: '${SUPABASE_SERVICE_ROLE_KEY}',
      email: '${SUPABASE_USER_EMAIL}',
    })
  })

  it('uses custom viewport dimensions', async () => {
    mockPrompts({ width: '1920', height: '1080' })
    await runInit()

    const def = JSON.parse(fs.readFileSync(path.join(tmpDir, 'recording.json'), 'utf-8'))
    expect(def.viewport).toEqual({ width: 1920, height: 1080 })
  })

  it('uses custom filename', async () => {
    mockPrompts({ filename: 'my-recording.json' })
    await runInit()

    expect(fs.existsSync(path.join(tmpDir, 'my-recording.json'))).toBe(true)
  })

  it('prompts for overwrite when file exists', async () => {
    const outPath = path.join(tmpDir, 'recording.json')
    fs.writeFileSync(outPath, '{}')

    mockPrompts()
    mockedConfirm.mockResolvedValue(true)
    await runInit()

    expect(mockedConfirm).toHaveBeenCalled()
    const def = JSON.parse(fs.readFileSync(outPath, 'utf-8'))
    expect(def.url).toBe('https://example.com')
  })

  it('aborts when user declines overwrite', async () => {
    const outPath = path.join(tmpDir, 'recording.json')
    fs.writeFileSync(outPath, '{"original": true}')

    mockPrompts()
    mockedConfirm.mockResolvedValue(false)

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await runInit()

    // File should remain unchanged
    const content = JSON.parse(fs.readFileSync(outPath, 'utf-8'))
    expect(content).toEqual({ original: true })
    expect(logSpy.mock.calls.some(c => c[0].includes('Aborted'))).toBe(true)
  })
})
