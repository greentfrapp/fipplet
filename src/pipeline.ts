import fs from 'fs'
import os from 'os'
import path from 'path'
import { type Browser, chromium } from 'playwright-core'
import {
  compositeScreenshot,
  renderBackground,
  renderRoundedMask,
  renderWindowFrame,
} from './chrome-renderer'
import { getCursorPng } from './cursors'
import {
  type RippleConfig,
  VP9_FAST_FLAGS,
  buildFilterGraph,
  buildPositionExpr,
  buildVisibilityExpr,
  runFFmpeg,
} from './post-process'
import type {
  BackgroundOptions,
  CursorEvent,
  CursorStyle,
  StepTiming,
  WindowChromeOptions,
} from './types'
import { buildFrameFilters } from './window-frame'

// ---------------------------------------------------------------------------
// Pipeline configuration
// ---------------------------------------------------------------------------

export interface PipelineConfig {
  videoPath: string
  cursor?: {
    events: CursorEvent[]
    style: CursorStyle
    size: number
  }
  frame?: {
    chrome?: WindowChromeOptions
    background?: BackgroundOptions
    videoWidth: number
    videoHeight: number
    screenshots?: string[]
  }
  speed?: {
    stepTimings: StepTiming[]
    globalSpeed: number
  }
}

// ---------------------------------------------------------------------------
// Speed filter (pure)
// ---------------------------------------------------------------------------

/**
 * Build a setpts filter expression for speed adjustment.
 *
 * Supports both uniform speed (single setpts) and per-step piecewise
 * speed (nested if/between expression). Pure function — no I/O.
 */
export function buildSpeedFilter(
  inputLabel: string,
  stepTimings: StepTiming[],
  globalSpeed: number,
  outputLabel: string = 'speed_out',
): { filter: string; outputLabel: string } {
  const hasPerStep = stepTimings.some((t) => t.speed !== globalSpeed)

  if (!hasPerStep) {
    return {
      filter: `[${inputLabel}]setpts=PTS/${globalSpeed}[${outputLabel}]`,
      outputLabel,
    }
  }

  // Per-step speed — piecewise setpts expression
  const sorted = [...stepTimings].sort((a, b) => a.startTime - b.startTime)

  interface Segment {
    start: number
    end: number
    speed: number
  }
  const segments: Segment[] = []
  let cursor = 0

  for (const timing of sorted) {
    if (timing.startTime > cursor) {
      segments.push({
        start: cursor,
        end: timing.startTime,
        speed: globalSpeed,
      })
    }
    segments.push({
      start: timing.startTime,
      end: timing.endTime,
      speed: timing.speed,
    })
    cursor = timing.endTime
  }

  let accumulatedOutput = 0
  const segOutputOffsets: number[] = []
  for (const seg of segments) {
    segOutputOffsets.push(accumulatedOutput)
    accumulatedOutput += (seg.end - seg.start) / seg.speed
  }

  const C = '\\,'

  // Fallback for time beyond all segments
  let expr = `(${accumulatedOutput.toFixed(6)}+(T-${cursor.toFixed(6)})/${globalSpeed.toFixed(6)})/TB`

  // Build from last segment to first
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i]
    const outOffset = segOutputOffsets[i].toFixed(6)
    const segStart = seg.start.toFixed(6)
    const segEnd = seg.end.toFixed(6)
    const segSpeed = seg.speed.toFixed(6)
    expr = `if(between(T${C}${segStart}${C}${segEnd})${C}(${outOffset}+(T-${segStart})/${segSpeed})/TB${C}${expr})`
  }

  return {
    filter: `[${inputLabel}]setpts=${expr}[${outputLabel}]`,
    outputLabel,
  }
}

// ---------------------------------------------------------------------------
// Post-processing pipeline (single FFmpeg pass)
// ---------------------------------------------------------------------------

/**
 * Run all post-processing stages (cursor overlay, window frame/background,
 * speed adjustment) in a single FFmpeg invocation.
 *
 * Each stage is conditionally included. The filter graph chains them:
 *   [0:v] → cursor filters → frame filters → setpts → [pipeline_out]
 *
 * Audio is copied when no speed adjustment is active, dropped otherwise
 * (setpts changes timing, making the audio track out of sync).
 *
 * Screenshot compositing (Playwright, not FFmpeg) runs after the video
 * pass if frame options include screenshots.
 */
export async function runPostProcessPipeline(
  config: PipelineConfig,
): Promise<string> {
  const { videoPath, cursor, frame, speed } = config

  if (!cursor && !frame && !speed) return videoPath

  const ext = path.extname(videoPath)
  const base = path.basename(videoPath, ext)
  const outputDir = path.dirname(videoPath)
  const outputPath = path.join(outputDir, `${base}-processed${ext}`)

  const inputArgs: string[] = ['-i', videoPath] // index 0
  let inputCount = 1
  const filterSegments: string[] = []
  let currentLabel = '0:v'
  const tempFiles: string[] = []
  let browser: Browser | undefined

  // Frame PNG paths — declared here so screenshot compositing can access them
  let framePngPath: string | undefined
  let bgPngPath: string | undefined
  let maskPngPath: string | undefined

  try {
    // -----------------------------------------------------------------
    // Stage 1: Cursor overlay
    // -----------------------------------------------------------------
    if (cursor) {
      const cursorPng = getCursorPng(cursor.style)
      inputArgs.push('-i', cursorPng)
      const cursorInputIdx = inputCount++

      // Build position/visibility expressions
      const moveEvents = cursor.events.filter((e) => e.type === 'move')
      const keyframes = moveEvents.map((e) => ({
        time: e.time,
        x: e.x,
        y: e.y,
        transitionMs: e.transitionMs ?? 350,
      }))
      const xKeyframes = keyframes.map((k) => ({
        time: k.time,
        value: k.x,
        transitionMs: k.transitionMs,
      }))
      const yKeyframes = keyframes.map((k) => ({
        time: k.time,
        value: k.y,
        transitionMs: k.transitionMs,
      }))
      const xExpr = buildPositionExpr(xKeyframes, 'x')
      const yExpr = buildPositionExpr(yKeyframes, 'y')
      const visExpr = buildVisibilityExpr(cursor.events)

      // Ripple config (inline lavfi source, no extra inputs)
      const rippleEvents = cursor.events.filter((e) => e.type === 'ripple')
      let rippleConfig: RippleConfig | null = null
      if (rippleEvents.length > 0) {
        const rippleSize = rippleEvents[0].rippleSize ?? 40
        const rippleColor =
          rippleEvents[0].rippleColor ?? 'rgba(59, 130, 246, 0.4)'
        const match = rippleColor.match(
          /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/,
        )
        rippleConfig = {
          size: rippleSize,
          r: match ? parseInt(match[1]) : 59,
          g: match ? parseInt(match[2]) : 130,
          b: match ? parseInt(match[3]) : 246,
          baseAlpha: match && match[4] ? parseFloat(match[4]) : 0.4,
          durationMs: 500,
        }
      }

      const cursorOutputLabel = frame || speed ? 'cur_out' : 'pipeline_out'

      const { filterGraph, extraInputArgs } = buildFilterGraph({
        cursorSize: cursor.size,
        xExpr,
        yExpr,
        visExpr,
        rippleEvents,
        rippleConfig,
        videoLabel: currentLabel,
        cursorInputIdx,
        outputLabel: cursorOutputLabel,
      })

      inputArgs.push(...extraInputArgs)
      filterSegments.push(filterGraph)
      currentLabel = cursorOutputLabel
    }

    // -----------------------------------------------------------------
    // Stage 2: Window chrome / background
    // -----------------------------------------------------------------
    if (frame) {
      const hasChrome = !!frame.chrome
      const hasBackground = !!frame.background

      const titleBarHeight = frame.chrome?.titleBarHeight ?? 38
      const titleBarColor = frame.chrome?.titleBarColor ?? '#e8e8e8'
      const trafficLights = frame.chrome?.trafficLights ?? true
      const bgColor = frame.background?.color ?? '#6366f1'
      const bgGradient = frame.background?.gradient
      const padding = frame.background?.padding ?? 60
      const borderRadius = frame.background?.borderRadius ?? 10

      const framedW = frame.videoWidth
      const framedH = frame.videoHeight + (hasChrome ? titleBarHeight : 0)
      const finalW = hasBackground ? framedW + padding * 2 : framedW
      const finalH = hasBackground ? framedH + padding * 2 : framedH

      // Launch browser to render frame PNGs
      browser = await chromium.launch({ headless: true })

      if (hasChrome) {
        const urlText =
          typeof frame.chrome?.url === 'string' ? frame.chrome.url : undefined
        framePngPath = await renderWindowFrame(
          {
            width: framedW,
            height: framedH,
            titleBarHeight,
            titleBarColor,
            trafficLights,
            borderRadius: hasBackground ? borderRadius : 0,
            urlText,
          },
          browser,
        )
        tempFiles.push(framePngPath)
      }

      if (hasBackground) {
        bgPngPath = await renderBackground(
          {
            totalWidth: finalW,
            totalHeight: finalH,
            windowWidth: framedW,
            windowHeight: framedH,
            padding,
            borderRadius,
            background: bgGradient
              ? { type: 'gradient', from: bgGradient.from, to: bgGradient.to }
              : { type: 'solid', color: bgColor },
          },
          browser,
        )
        tempFiles.push(bgPngPath)

        if (borderRadius > 0) {
          maskPngPath = await renderRoundedMask(
            {
              width: framedW,
              height: framedH,
              borderRadius,
            },
            browser,
          )
          tempFiles.push(maskPngPath)
        }
      }

      const frameOutputLabel = speed ? 'frm_out' : 'pipeline_out'

      const { filters, extraInputArgs, nextInputIndex } = buildFrameFilters({
        inputLabel: currentLabel,
        inputIndexStart: inputCount,
        chrome: frame.chrome,
        background: frame.background,
        videoWidth: frame.videoWidth,
        videoHeight: frame.videoHeight,
        framePngPath,
        bgPngPath,
        maskPngPath,
        outputLabel: frameOutputLabel,
      })

      inputCount = nextInputIndex
      inputArgs.push(...extraInputArgs)
      filterSegments.push(filters.join(';'))
      currentLabel = frameOutputLabel

      // --- Screenshot compositing (Playwright, not FFmpeg) ---
      if (
        frame.screenshots &&
        frame.screenshots.length > 0 &&
        framePngPath &&
        bgPngPath
      ) {
        for (const ssPath of frame.screenshots) {
          if (!fs.existsSync(ssPath)) continue
          await compositeScreenshot(
            {
              screenshotPath: ssPath,
              framePngPath,
              bgPngPath,
              totalWidth: finalW,
              totalHeight: finalH,
              padding,
              titleBarHeight,
              borderRadius,
            },
            browser,
          )
        }
      }
    }

    // -----------------------------------------------------------------
    // Stage 3: Speed adjustment
    // -----------------------------------------------------------------
    if (speed) {
      const { filter } = buildSpeedFilter(
        currentLabel,
        speed.stepTimings,
        speed.globalSpeed,
        'pipeline_out',
      )
      filterSegments.push(filter)
      currentLabel = 'pipeline_out'
    }

    // -----------------------------------------------------------------
    // Run single FFmpeg invocation
    // -----------------------------------------------------------------
    const filterGraph = filterSegments.join(';')
    const filterScriptPath = path.join(
      os.tmpdir(),
      `fipplet-pipeline-${Date.now()}.txt`,
    )
    fs.writeFileSync(filterScriptPath, filterGraph)
    tempFiles.push(filterScriptPath)

    // Drop audio when speed is active (timing would be wrong)
    const audioArgs = speed ? ['-an'] : ['-map', '0:a?', '-c:a', 'copy']

    await runFFmpeg([
      ...inputArgs,
      '-filter_complex_script',
      filterScriptPath,
      '-map',
      `[${currentLabel}]`,
      ...audioArgs,
      '-c:v',
      'libvpx-vp9',
      ...VP9_FAST_FLAGS,
      '-y',
      outputPath,
    ])
  } finally {
    if (browser) await browser.close()
    for (const f of tempFiles) {
      try {
        fs.unlinkSync(f)
      } catch {}
    }
  }

  return outputPath
}
