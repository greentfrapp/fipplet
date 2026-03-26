import fs from 'fs'
import path from 'path'
import type { Page } from 'playwright-core'

import { awaitSelector, focusElement, getScreenCenter } from './actions'
import { createCursorTracker } from './cursor'
import { log, logError, logVerbose } from './logger'
import { runPostProcessPipeline } from './pipeline'
import { convertToGif, convertToMp4 } from './post-process'
import type {
  BackgroundOptions,
  CursorOptions,
  CursorStyle,
  OutputFormat,
  RecordingResult,
  StepTiming,
  WindowChromeOptions,
  ZoomState,
} from './types'
import { sanitizeFilename, timestamp } from './utils'
import { createZoomState } from './zoom'

export interface RecordPageOptions {
  outputDir?: string
  cursor?: boolean | CursorOptions
  chrome?: boolean | WindowChromeOptions
  background?: boolean | BackgroundOptions
  speed?: number
  outputFormat?: OutputFormat
  scale?: number
  keepIntermediates?: boolean
}

export interface PageRecorder {
  /** The underlying Playwright Page. Unusable after stop(). */
  readonly page: Page

  click(selector: string, options?: { timeout?: number }): Promise<void>
  type(
    selector: string,
    text: string,
    options?: { delay?: number; clear?: boolean; timeout?: number },
  ): Promise<void>
  fill(
    selector: string,
    text: string,
    options?: { timeout?: number },
  ): Promise<void>
  hover(selector: string, options?: { timeout?: number }): Promise<void>
  scroll(options?: {
    x?: number
    y?: number
    scrollSpeed?: number
  }): Promise<void>
  zoom(options: {
    selector?: string
    scale?: number
    x?: number
    y?: number
    duration?: number
  }): Promise<void>
  screenshot(name?: string): Promise<string>
  keyboard(key: string): Promise<void>
  navigate(url: string): Promise<void>
  wait(ms?: number): Promise<void>

  /** Stop recording and run post-processing. Closes the browser context — page is unusable after. */
  stop(): Promise<RecordingResult>
}

const DEFAULT_SELECTOR_TIMEOUT = 5000
const DEFAULT_PAUSE_AFTER = 500

export async function recordPage(
  page: Page,
  options: RecordPageOptions = {},
): Promise<PageRecorder> {
  if (!page.video()) {
    throw new Error(
      'recordPage requires a browser context created with recordVideo. ' +
        'Pass recordVideo to browser.newContext().',
    )
  }

  const vp = page.viewportSize()
  if (!vp) {
    throw new Error('recordPage requires a page with a viewport set.')
  }

  const scale = options.scale ?? 1
  const outputDir = options.outputDir ?? './testreel-output'
  fs.mkdirSync(outputDir, { recursive: true })

  // Normalize cursor config
  const cursorConfig = options.cursor
  const cursorEnabled =
    cursorConfig === undefined ||
    cursorConfig === true ||
    (typeof cursorConfig === 'object' && cursorConfig.enabled !== false)
  const cursorOptions: CursorOptions | undefined = cursorEnabled
    ? typeof cursorConfig === 'object'
      ? cursorConfig
      : {}
    : undefined

  const cursorTracker = cursorEnabled ? createCursorTracker(scale) : undefined
  const zoomState = createZoomState()
  const screenshots: string[] = []
  const globalSpeed = options.speed ?? 1.0
  const stepTimings: StepTiming[] = []
  const stepTimerStart = Date.now()
  let stopped = false

  // Helpers for cursor
  async function moveCursor(selector: string): Promise<void> {
    if (cursorEnabled && cursorTracker) {
      await cursorTracker.moveCursorTo(page, selector, zoomState, cursorOptions)
    }
  }

  async function ripple(): Promise<void> {
    if (cursorEnabled && cursorTracker) {
      await cursorTracker.triggerRipple(page, cursorOptions)
    }
  }

  function recordTiming(startTime: number): void {
    const endTime = (Date.now() - stepTimerStart) / 1000
    stepTimings.push({
      stepIndex: stepTimings.length,
      startTime,
      endTime,
      speed: globalSpeed,
    })
  }

  const recorder: PageRecorder = {
    page,

    async click(selector, opts) {
      const start = (Date.now() - stepTimerStart) / 1000
      const timeout = opts?.timeout ?? DEFAULT_SELECTOR_TIMEOUT
      await awaitSelector(page, selector, timeout)
      await moveCursor(selector)
      await ripple()
      const center = await getScreenCenter(page, selector)
      if (center) {
        await page.mouse.click(center.x, center.y)
      }
      await page.waitForTimeout(DEFAULT_PAUSE_AFTER)
      recordTiming(start)
    },

    async type(selector, text, opts) {
      const start = (Date.now() - stepTimerStart) / 1000
      const timeout = opts?.timeout ?? DEFAULT_SELECTOR_TIMEOUT
      await awaitSelector(page, selector, timeout)
      await moveCursor(selector)
      if (opts?.clear) await ripple()
      const center = await getScreenCenter(page, selector)
      if (center) {
        if (opts?.clear) {
          await page.mouse.click(center.x, center.y, { clickCount: 3 })
        } else {
          await page.mouse.click(center.x, center.y)
        }
      }
      await page.keyboard.type(text, { delay: opts?.delay ?? 80 })
      await page.waitForTimeout(DEFAULT_PAUSE_AFTER)
      recordTiming(start)
    },

    async fill(selector, text, opts) {
      const start = (Date.now() - stepTimerStart) / 1000
      const timeout = opts?.timeout ?? DEFAULT_SELECTOR_TIMEOUT
      await awaitSelector(page, selector, timeout)
      await moveCursor(selector)
      await page.evaluate(
        ({ sel, text }: { sel: string; text: string }) => {
          const el = document.querySelector(sel) as HTMLInputElement | null
          if (!el) return
          el.focus()
          el.value = text
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
        },
        { sel: selector, text },
      )
      await page.waitForTimeout(DEFAULT_PAUSE_AFTER)
      recordTiming(start)
    },

    async hover(selector, opts) {
      const start = (Date.now() - stepTimerStart) / 1000
      const timeout = opts?.timeout ?? DEFAULT_SELECTOR_TIMEOUT
      await awaitSelector(page, selector, timeout)
      await moveCursor(selector)
      const center = await getScreenCenter(page, selector)
      if (center) {
        await page.mouse.move(center.x, center.y)
      }
      await page.waitForTimeout(DEFAULT_PAUSE_AFTER)
      recordTiming(start)
    },

    async scroll(opts) {
      const start = (Date.now() - stepTimerStart) / 1000
      const baseDuration = 600
      const speedMultiplier = opts?.scrollSpeed ?? 1
      const duration = baseDuration / speedMultiplier

      await page.evaluate(
        ({
          x,
          y,
          duration,
        }: {
          x: number | undefined
          y: number | undefined
          duration: number
        }) => {
          return new Promise<void>((resolve) => {
            const startX = window.scrollX
            const startY = window.scrollY
            const dx = x ?? 0
            const dy = y ?? 0
            const start = performance.now()

            function ease(t: number): number {
              return t < 0.5
                ? 4 * t * t * t
                : 1 - Math.pow(-2 * t + 2, 3) / 2
            }

            function tick(now: number) {
              const elapsed = now - start
              const t = Math.min(elapsed / duration, 1)
              const p = ease(t)
              window.scrollTo(startX + dx * p, startY + dy * p)
              if (t < 1) {
                requestAnimationFrame(tick)
              } else {
                resolve()
              }
            }

            requestAnimationFrame(tick)
          })
        },
        { x: opts?.x, y: opts?.y, duration },
      )
      await page.waitForTimeout(DEFAULT_PAUSE_AFTER)
      recordTiming(start)
    },

    async zoom(opts) {
      const start = (Date.now() - stepTimerStart) / 1000
      const zoomScale = opts.scale ?? 2
      const duration = opts.duration ?? 600

      if (cursorEnabled && cursorTracker && opts.selector) {
        await cursorTracker.moveCursorTo(
          page,
          opts.selector,
          zoomState,
          cursorOptions,
        )
      }

      if (zoomScale === 1 && !opts.selector) {
        zoomState.scale = 1
        zoomState.tx = 0
        zoomState.ty = 0
        if (cursorTracker) cursorTracker.setZoom(1, duration)
        await page.evaluate((ms: number) => {
          const html = document.documentElement
          html.style.transition = `transform ${ms}ms ease-in-out`
          html.style.transformOrigin = 'top left'
          html.style.transform = 'scale(1) translate(0px, 0px)'
        }, duration)
        await page.waitForTimeout(duration + 100)
        recordTiming(start)
        return
      }

      let targetX: number
      let targetY: number

      if (opts.selector) {
        const {
          scale: curScale,
          tx: curTx,
          ty: curTy,
        } = zoomState
        const center = await page.evaluate(
          ({
            sel,
            s,
            tx,
            ty,
          }: {
            sel: string
            s: number
            tx: number
            ty: number
          }) => {
            const el = document.querySelector(sel)
            if (!el) return null
            const rect = el.getBoundingClientRect()
            const screenX = rect.x + rect.width / 2
            const screenY = rect.y + rect.height / 2
            return {
              x: s === 1 ? screenX : screenX / s - tx,
              y: s === 1 ? screenY : screenY / s - ty,
            }
          },
          { sel: opts.selector, s: curScale, tx: curTx, ty: curTy },
        )
        if (!center)
          throw new Error(`zoom target '${opts.selector}' not found`)
        targetX = center.x
        targetY = center.y
      } else {
        targetX = opts.x ?? 640
        targetY = opts.y ?? 360
      }

      const currentVp = page.viewportSize()
      if (!currentVp)
        throw new Error(
          'viewport size not set — cannot compute zoom translation',
        )
      const { width: vw, height: vh } = currentVp

      const tx = vw / 2 / zoomScale - targetX
      const ty = vh / 2 / zoomScale - targetY
      const clampedTx = Math.min(0, Math.max(vw / zoomScale - vw, tx))
      const clampedTy = Math.min(0, Math.max(vh / zoomScale - vh, ty))

      zoomState.scale = zoomScale
      zoomState.tx = clampedTx
      zoomState.ty = clampedTy
      if (cursorTracker) cursorTracker.setZoom(zoomScale, duration)

      await page.evaluate(
        ({
          scale,
          tx,
          ty,
          ms,
        }: {
          scale: number
          tx: number
          ty: number
          ms: number
        }) => {
          const html = document.documentElement
          html.style.transition = `transform ${ms}ms ease-in-out`
          html.style.transformOrigin = 'top left'
          html.style.transform = `scale(${scale}) translate(${tx}px, ${ty}px)`
        },
        { scale: zoomScale, tx: clampedTx, ty: clampedTy, ms: duration },
      )

      await page.waitForTimeout(duration + 100)
      recordTiming(start)
    },

    async screenshot(name?) {
      const start = (Date.now() - stepTimerStart) / 1000
      const safeName = sanitizeFilename(name ?? `step-${timestamp()}`)
      const filepath = path.join(outputDir, `${safeName}.png`)
      await page.screenshot({ path: filepath })
      screenshots.push(filepath)
      recordTiming(start)
      return filepath
    },

    async keyboard(key) {
      const start = (Date.now() - stepTimerStart) / 1000
      await page.keyboard.press(key)
      await page.waitForTimeout(DEFAULT_PAUSE_AFTER)
      recordTiming(start)
    },

    async navigate(url) {
      const start = (Date.now() - stepTimerStart) / 1000
      zoomState.scale = 1
      zoomState.tx = 0
      zoomState.ty = 0
      await page
        .goto(url, { waitUntil: 'networkidle', timeout: 10000 })
        .catch((err) =>
          logError(
            `  warning: navigate to '${url}' did not reach networkidle: ${err.message}`,
          ),
        )
      await page.waitForTimeout(DEFAULT_PAUSE_AFTER)
      recordTiming(start)
    },

    async wait(ms) {
      const start = (Date.now() - stepTimerStart) / 1000
      await page.waitForTimeout(ms ?? 1000)
      recordTiming(start)
    },

    async stop(): Promise<RecordingResult> {
      if (stopped) {
        throw new Error('PageRecorder.stop() has already been called.')
      }
      stopped = true

      // Final screenshot
      const finalPath = path.join(outputDir, `final-${timestamp()}.png`)
      await page.screenshot({ path: finalPath })
      screenshots.push(finalPath)

      // Save video: close context to finalize, then saveAs
      const video = page.video()
      let videoPath: string | undefined
      let cursorEventsPath: string | undefined

      await page.context().close()

      if (video) {
        videoPath = path.join(outputDir, `recording-${timestamp()}.webm`)
        await video.saveAs(videoPath)
        await video.delete()
      }

      // Write cursor events
      let cursorEventsForPipeline:
        | import('./types').CursorEvent[]
        | undefined
      if (cursorTracker && videoPath) {
        const cursorEvents = cursorTracker.getEvents()
        cursorEventsPath = path.join(outputDir, 'cursor-events.json')
        fs.writeFileSync(
          cursorEventsPath,
          JSON.stringify(cursorEvents, null, 2),
        )
        logVerbose(
          `  cursor events: ${cursorEvents.length} events → ${cursorEventsPath}`,
        )
        if (cursorEvents.length > 0) {
          cursorEventsForPipeline = cursorEvents
        }
      }

      // Resolve chrome/background config
      const chromeConfig = options.chrome
      const bgConfig = options.background
      const hasChrome =
        chromeConfig === true ||
        (typeof chromeConfig === 'object' && chromeConfig.enabled !== false)
      const hasBackground =
        bgConfig === true ||
        (typeof bgConfig === 'object' && bgConfig.enabled !== false)

      const chromeOpts = hasChrome
        ? typeof chromeConfig === 'object'
          ? { ...chromeConfig }
          : {}
        : undefined
      const bgOpts = hasBackground
        ? typeof bgConfig === 'object'
          ? bgConfig
          : {}
        : undefined

      const needsSpeed =
        globalSpeed !== 1.0 || stepTimings.some((t) => t.speed !== 1.0)
      const needsPipeline =
        cursorEventsForPipeline || hasChrome || hasBackground || needsSpeed

      if (needsPipeline && videoPath) {
        log('  post-processing...')
        try {
          const processedPath = await runPostProcessPipeline({
            videoPath,
            cursor: cursorEventsForPipeline
              ? {
                  events: cursorEventsForPipeline,
                  defaultStyle:
                    (cursorOptions?.style as CursorStyle) ?? 'default',
                  size: (cursorOptions?.size ?? 24) * scale,
                }
              : undefined,
            frame:
              hasChrome || hasBackground
                ? {
                    chrome: chromeOpts,
                    background: bgOpts,
                    videoWidth: vp.width * scale,
                    videoHeight: vp.height * scale,
                    screenshots,
                    scale,
                  }
                : undefined,
            speed: needsSpeed ? { stepTimings, globalSpeed } : undefined,
          })
          if (processedPath !== videoPath) {
            fs.unlinkSync(videoPath)
            fs.renameSync(processedPath, videoPath)
          }
          log('  post-processing complete.')
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          logError(`  warning: post-processing failed: ${msg}`)
        }
      }

      // Convert output format
      const outputFormat: OutputFormat = options.outputFormat ?? 'webm'
      if (outputFormat !== 'webm' && videoPath) {
        log(`  converting to ${outputFormat}...`)
        try {
          const converter =
            outputFormat === 'mp4' ? convertToMp4 : convertToGif
          const convertedPath = await converter(videoPath)
          fs.unlinkSync(videoPath)
          videoPath = convertedPath
          log(`  conversion to ${outputFormat} complete.`)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          logError(`  warning: format conversion failed: ${msg}`)
        }
      }

      // Clean up intermediates
      if (!options.keepIntermediates) {
        if (cursorEventsPath) {
          try {
            fs.unlinkSync(cursorEventsPath)
            logVerbose(`  cleaned up: ${cursorEventsPath}`)
            cursorEventsPath = undefined
          } catch {
            // ignore
          }
        }
      }

      return {
        video: videoPath,
        screenshots,
        cursorEvents: cursorEventsPath,
      }
    },
  }

  return recorder
}
