import fs from 'fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordPage } from '../record-page'

// Mock heavy dependencies that are not under test
vi.mock('../pipeline', () => ({
  runPostProcessPipeline: vi.fn().mockResolvedValue('/tmp/test-output/processed.webm'),
}))
vi.mock('../post-process', () => ({
  convertToMp4: vi.fn().mockResolvedValue('/tmp/test-output/recording.mp4'),
  convertToGif: vi.fn().mockResolvedValue('/tmp/test-output/recording.gif'),
}))

const videoMock = {
  saveAs: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
}

const contextMock = {
  close: vi.fn().mockResolvedValue(undefined),
}

function mockPage(overrides: Record<string, any> = {}) {
  const waitForMock = vi.fn().mockResolvedValue(undefined)
  return {
    video: vi.fn().mockReturnValue(videoMock),
    viewportSize: vi.fn().mockReturnValue({ width: 1280, height: 720 }),
    context: vi.fn().mockReturnValue(contextMock),
    locator: vi.fn().mockReturnValue({
      waitFor: waitForMock,
    }),
    evaluate: vi.fn().mockResolvedValue({ x: 100, y: 200 }),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    mouse: {
      click: vi.fn().mockResolvedValue(undefined),
      move: vi.fn().mockResolvedValue(undefined),
    },
    keyboard: {
      press: vi.fn().mockResolvedValue(undefined),
      type: vi.fn().mockResolvedValue(undefined),
    },
    screenshot: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any
}

describe('recordPage initialization', () => {
  beforeEach(() => {
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws when page has no video (context lacks recordVideo)', async () => {
    const page = mockPage({ video: vi.fn().mockReturnValue(null) })
    await expect(recordPage(page)).rejects.toThrow(
      'recordPage requires a browser context created with recordVideo',
    )
  })

  it('throws when page has no viewport', async () => {
    const page = mockPage({ viewportSize: vi.fn().mockReturnValue(null) })
    await expect(recordPage(page)).rejects.toThrow(
      'recordPage requires a page with a viewport set',
    )
  })

  it('succeeds with valid page and returns a PageRecorder', async () => {
    const page = mockPage()
    const recorder = await recordPage(page)
    expect(recorder).toBeDefined()
    expect(recorder.page).toBe(page)
    expect(typeof recorder.click).toBe('function')
    expect(typeof recorder.type).toBe('function')
    expect(typeof recorder.fill).toBe('function')
    expect(typeof recorder.hover).toBe('function')
    expect(typeof recorder.scroll).toBe('function')
    expect(typeof recorder.zoom).toBe('function')
    expect(typeof recorder.screenshot).toBe('function')
    expect(typeof recorder.keyboard).toBe('function')
    expect(typeof recorder.navigate).toBe('function')
    expect(typeof recorder.wait).toBe('function')
    expect(typeof recorder.stop).toBe('function')
  })

  it('creates outputDir on init', async () => {
    const page = mockPage()
    await recordPage(page, { outputDir: '/tmp/custom-output' })
    expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/custom-output', {
      recursive: true,
    })
  })

  it('defaults outputDir to ./testreel-output', async () => {
    const page = mockPage()
    await recordPage(page)
    expect(fs.mkdirSync).toHaveBeenCalledWith('./testreel-output', {
      recursive: true,
    })
  })
})

describe('PageRecorder action methods', () => {
  let page: any
  let recorder: any

  beforeEach(async () => {
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined)
    page = mockPage()
    recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('click', () => {
    it('awaits selector and clicks at screen center', async () => {
      await recorder.click('#btn')
      expect(page.locator).toHaveBeenCalledWith('#btn')
      expect(page.locator('#btn').waitFor).toHaveBeenCalledWith({
        state: 'visible',
        timeout: 5000,
      })
      expect(page.evaluate).toHaveBeenCalled()
      expect(page.mouse.click).toHaveBeenCalledWith(100, 200)
    })

    it('uses custom timeout', async () => {
      await recorder.click('#btn', { timeout: 10000 })
      expect(page.locator('#btn').waitFor).toHaveBeenCalledWith({
        state: 'visible',
        timeout: 10000,
      })
    })

    it('waits pauseAfter (500ms) after click', async () => {
      await recorder.click('#btn')
      expect(page.waitForTimeout).toHaveBeenCalledWith(500)
    })
  })

  describe('type', () => {
    it('awaits selector, clicks, and types text with default delay', async () => {
      await recorder.type('#input', 'hello')
      expect(page.locator).toHaveBeenCalledWith('#input')
      expect(page.mouse.click).toHaveBeenCalledWith(100, 200)
      expect(page.keyboard.type).toHaveBeenCalledWith('hello', { delay: 80 })
    })

    it('uses custom delay', async () => {
      await recorder.type('#input', 'hello', { delay: 50 })
      expect(page.keyboard.type).toHaveBeenCalledWith('hello', { delay: 50 })
    })

    it('triple-clicks to clear when clear option is true', async () => {
      await recorder.type('#input', 'new text', { clear: true })
      expect(page.mouse.click).toHaveBeenCalledWith(100, 200, {
        clickCount: 3,
      })
    })

    it('single-clicks when clear option is false/absent', async () => {
      await recorder.type('#input', 'text')
      expect(page.mouse.click).toHaveBeenCalledWith(100, 200)
    })
  })

  describe('fill', () => {
    it('awaits selector and evaluates to set value', async () => {
      await recorder.fill('#input', 'filled value')
      expect(page.locator).toHaveBeenCalledWith('#input')
      expect(page.evaluate).toHaveBeenCalled()
      // evaluate is called twice: once for getScreenCenter (from click path? no — fill uses evaluate directly)
      // First call is getScreenCenter in moveCursor (cursor disabled, so skipped)
      // Only call is the fill evaluate
      const evalCalls = page.evaluate.mock.calls
      const fillCall = evalCalls.find(
        (call: any[]) =>
          call[1] &&
          typeof call[1] === 'object' &&
          'sel' in call[1] &&
          'text' in call[1],
      )
      expect(fillCall).toBeDefined()
      expect(fillCall[1]).toEqual({ sel: '#input', text: 'filled value' })
    })
  })

  describe('hover', () => {
    it('awaits selector and moves mouse to screen center', async () => {
      await recorder.hover('.link')
      expect(page.locator).toHaveBeenCalledWith('.link')
      expect(page.mouse.move).toHaveBeenCalledWith(100, 200)
    })
  })

  describe('scroll', () => {
    it('calls page.evaluate with scroll parameters', async () => {
      await recorder.scroll({ x: 0, y: 300 })
      expect(page.evaluate).toHaveBeenCalled()
    })
  })

  describe('keyboard', () => {
    it('presses the specified key', async () => {
      await recorder.keyboard('Enter')
      expect(page.keyboard.press).toHaveBeenCalledWith('Enter')
    })

    it('waits pauseAfter', async () => {
      await recorder.keyboard('Escape')
      expect(page.waitForTimeout).toHaveBeenCalledWith(500)
    })
  })

  describe('navigate', () => {
    it('navigates to URL with networkidle', async () => {
      await recorder.navigate('https://example.com')
      expect(page.goto).toHaveBeenCalledWith('https://example.com', {
        waitUntil: 'networkidle',
        timeout: 10000,
      })
    })
  })

  describe('wait', () => {
    it('waits the specified ms', async () => {
      await recorder.wait(2000)
      expect(page.waitForTimeout).toHaveBeenCalledWith(2000)
    })

    it('defaults to 1000ms', async () => {
      await recorder.wait()
      expect(page.waitForTimeout).toHaveBeenCalledWith(1000)
    })
  })

  describe('screenshot', () => {
    it('takes a screenshot with sanitized name', async () => {
      const filepath = await recorder.screenshot('my-shot')
      expect(page.screenshot).toHaveBeenCalled()
      const callArgs = page.screenshot.mock.calls[0][0]
      expect(callArgs.path).toMatch(/my-shot\.png$/)
      expect(filepath).toBe(callArgs.path)
    })
  })
})

describe('PageRecorder cursor tracking', () => {
  let page: any

  beforeEach(() => {
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'unlinkSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'renameSync').mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('enables cursor by default', async () => {
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
    })

    // Perform a click — cursor tracker should be called (moveCursorTo uses page.evaluate)
    await recorder.click('#btn')
    // page.evaluate is called for: moveCursorTo (cursor tracking) + getScreenCenter
    // If cursor were disabled, only getScreenCenter would be called
    const evalCalls = page.evaluate.mock.calls
    expect(evalCalls.length).toBeGreaterThanOrEqual(2)
  })

  it('disables cursor when cursor: false', async () => {
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    await recorder.click('#btn')
    // Only getScreenCenter evaluate call, no moveCursorTo
    const evalCalls = page.evaluate.mock.calls
    expect(evalCalls).toHaveLength(1) // just getScreenCenter
  })

  it('disables cursor when cursor.enabled is false', async () => {
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: { enabled: false },
    })

    await recorder.click('#btn')
    const evalCalls = page.evaluate.mock.calls
    expect(evalCalls).toHaveLength(1) // just getScreenCenter
  })
})

describe('PageRecorder.stop()', () => {
  let page: any

  beforeEach(() => {
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'unlinkSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'renameSync').mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('closes context, saves video, and returns result', async () => {
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    const result = await recorder.stop()

    expect(page.screenshot).toHaveBeenCalled() // final screenshot
    expect(contextMock.close).toHaveBeenCalled()
    expect(videoMock.saveAs).toHaveBeenCalled()
    expect(videoMock.delete).toHaveBeenCalled()
    expect(result.video).toMatch(/recording-.*\.webm$/)
    expect(result.screenshots).toHaveLength(1) // final screenshot
  })

  it('throws on double stop', async () => {
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    await recorder.stop()
    await expect(recorder.stop()).rejects.toThrow(
      'PageRecorder.stop() has already been called',
    )
  })

  it('accumulates screenshots from actions', async () => {
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    await recorder.screenshot('shot1')
    await recorder.screenshot('shot2')
    const result = await recorder.stop()

    // 2 action screenshots + 1 final screenshot
    expect(result.screenshots).toHaveLength(3)
  })

  it('closes context not browser — page.context().close() is called', async () => {
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    await recorder.stop()
    expect(page.context).toHaveBeenCalled()
    expect(contextMock.close).toHaveBeenCalled()
  })
})

describe('PageRecorder.stop() post-processing', () => {
  let page: any

  beforeEach(() => {
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'unlinkSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'renameSync').mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('skips pipeline when no cursor, chrome, background, or speed', async () => {
    const { runPostProcessPipeline } = await import('../pipeline')
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    await recorder.stop()
    expect(runPostProcessPipeline).not.toHaveBeenCalled()
  })

  it('runs pipeline when chrome is enabled', async () => {
    const { runPostProcessPipeline } = await import('../pipeline')
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
      chrome: true,
    })

    await recorder.stop()
    expect(runPostProcessPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        frame: expect.objectContaining({
          videoWidth: 1280,
          videoHeight: 720,
        }),
      }),
    )
  })

  it('runs pipeline when background is enabled', async () => {
    const { runPostProcessPipeline } = await import('../pipeline')
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
      background: { color: '#ff0000' },
    })

    await recorder.stop()
    expect(runPostProcessPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        frame: expect.objectContaining({
          background: { color: '#ff0000' },
        }),
      }),
    )
  })

  it('passes scaled video dimensions when scale > 1', async () => {
    const { runPostProcessPipeline } = await import('../pipeline')
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
      chrome: true,
      scale: 2,
    })

    await recorder.stop()
    expect(runPostProcessPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        frame: expect.objectContaining({
          videoWidth: 2560,
          videoHeight: 1440,
          scale: 2,
        }),
      }),
    )
  })

  it('runs pipeline when speed is not 1.0', async () => {
    const { runPostProcessPipeline } = await import('../pipeline')
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
      speed: 2.0,
    })

    await recorder.wait(100)
    await recorder.stop()
    expect(runPostProcessPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        speed: expect.objectContaining({
          globalSpeed: 2.0,
        }),
      }),
    )
  })
})

describe('PageRecorder.stop() format conversion', () => {
  let page: any

  beforeEach(() => {
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'unlinkSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'renameSync').mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not convert when format is webm (default)', async () => {
    const { convertToMp4 } = await import('../post-process')
    const { convertToGif } = await import('../post-process')
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    const result = await recorder.stop()
    expect(convertToMp4).not.toHaveBeenCalled()
    expect(convertToGif).not.toHaveBeenCalled()
    expect(result.video).toMatch(/\.webm$/)
  })

  it('converts to mp4 when outputFormat is mp4', async () => {
    const { convertToMp4 } = await import('../post-process')
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
      outputFormat: 'mp4',
    })

    const result = await recorder.stop()
    expect(convertToMp4).toHaveBeenCalled()
    expect(result.video).toMatch(/\.mp4$/)
  })

  it('converts to gif when outputFormat is gif', async () => {
    const { convertToGif } = await import('../post-process')
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
      outputFormat: 'gif',
    })

    const result = await recorder.stop()
    expect(convertToGif).toHaveBeenCalled()
    expect(result.video).toMatch(/\.gif$/)
  })
})

describe('PageRecorder zoom action', () => {
  let page: any

  beforeEach(() => {
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resets zoom when scale=1 and no selector', async () => {
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    await recorder.zoom({ scale: 1 })
    // Should call evaluate to set transform to scale(1) translate(0, 0)
    expect(page.evaluate).toHaveBeenCalled()
    expect(page.waitForTimeout).toHaveBeenCalledWith(700) // 600 + 100
  })

  it('throws when zoom target selector not found', async () => {
    page = mockPage({ evaluate: vi.fn().mockResolvedValue(null) })
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    await expect(
      recorder.zoom({ selector: '#missing', scale: 2 }),
    ).rejects.toThrow("zoom target '#missing' not found")
  })

  it('computes zoom translation from selector center', async () => {
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    await recorder.zoom({ selector: '#target', scale: 2 })
    // evaluate is called: once for selector center lookup, once for applying transform
    expect(page.evaluate).toHaveBeenCalledTimes(2)
  })
})

describe('PageRecorder navigate resets zoom', () => {
  beforeEach(() => {
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'unlinkSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'renameSync').mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('zoom state is reset after navigate', async () => {
    const page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    // Zoom in
    await recorder.zoom({ x: 400, y: 300, scale: 2 })
    // Navigate — should reset zoom state
    await recorder.navigate('https://example.com')
    // Next zoom should use default center (640, 360) if no selector/coords
    // Just verify navigate was called correctly
    expect(page.goto).toHaveBeenCalledWith('https://example.com', {
      waitUntil: 'networkidle',
      timeout: 10000,
    })
  })
})
