import fs from 'fs'
import os from 'os'
import path from 'path'
import { chromium } from 'playwright-core'
import type { WindowChromeOptions, BackgroundOptions } from './types'
import { hexToFFmpeg } from './drawing'
import { renderWindowFrame, renderBackground, renderRoundedMask, compositeScreenshot } from './chrome-renderer'
import { runFFmpeg, VP9_FAST_FLAGS } from './post-process'

// ---------------------------------------------------------------------------
// Pure filter-graph construction for frame overlay
// ---------------------------------------------------------------------------

export interface FrameFilterInput {
  inputLabel: string
  inputIndexStart: number
  chrome?: WindowChromeOptions
  background?: BackgroundOptions
  videoWidth: number
  videoHeight: number
  framePngPath?: string
  bgPngPath?: string
  maskPngPath?: string
  outputLabel?: string
}

export interface FrameFilterOutput {
  filters: string[]
  extraInputArgs: string[]
  outputLabel: string
  nextInputIndex: number
}

/**
 * Build FFmpeg filter graph fragments for window chrome and background.
 *
 * Pure function — no I/O. The caller renders PNGs (via Playwright) and
 * passes their paths in. Returns filters and extra -i args to splice
 * into an FFmpeg invocation.
 */
export function buildFrameFilters(input: FrameFilterInput): FrameFilterOutput {
  const {
    inputLabel, inputIndexStart, chrome, background,
    videoWidth, videoHeight,
    framePngPath, bgPngPath, maskPngPath,
    outputLabel = 'frame_out',
  } = input
  const hasChrome = !!chrome
  const hasBackground = !!background

  if (!hasChrome && !hasBackground) {
    return { filters: [], extraInputArgs: [], outputLabel: inputLabel, nextInputIndex: inputIndexStart }
  }

  const filters: string[] = []
  const extraInputArgs: string[] = []
  let currentLabel = inputLabel
  let inputCount = inputIndexStart

  const titleBarHeight = chrome?.titleBarHeight ?? 38
  const titleBarColor = chrome?.titleBarColor ?? '#e8e8e8'
  const padding = background?.padding ?? 60
  const borderRadius = background?.borderRadius ?? 10

  // --- Title bar + frame overlay ---
  if (hasChrome && framePngPath) {
    filters.push(
      `[${currentLabel}]pad=iw:ih+${titleBarHeight}:0:${titleBarHeight}:${hexToFFmpeg(titleBarColor)}[padded]`,
    )
    currentLabel = 'padded'

    extraInputArgs.push('-i', framePngPath)
    const frameInputIdx = inputCount++

    filters.push(
      `[${currentLabel}][${frameInputIdx}:v]overlay=0:0:format=auto[chromed]`,
    )
    currentLabel = 'chromed'
  }

  // --- Rounded corners + background ---
  if (hasBackground && bgPngPath) {
    extraInputArgs.push('-loop', '1', '-i', bgPngPath)
    const bgInputIdx = inputCount++

    if (borderRadius > 0 && maskPngPath) {
      extraInputArgs.push('-loop', '1', '-i', maskPngPath)
      const maskInputIdx = inputCount++

      filters.push(
        `[${currentLabel}]format=yuva420p[chromed_a]`,
        `[${maskInputIdx}:v]format=gray[mask]`,
        `[chromed_a][mask]alphamerge[rounded]`,
      )
      currentLabel = 'rounded'
    }

    filters.push(
      `[${bgInputIdx}:v][${currentLabel}]overlay=${padding}:${padding}:shortest=1:format=auto[${outputLabel}]`,
    )
    currentLabel = outputLabel
  } else {
    // No background — rename last filter's output to the desired label
    const lastFilter = filters[filters.length - 1]
    filters[filters.length - 1] = lastFilter.replace(/\[[^\]]+\]$/, `[${outputLabel}]`)
    currentLabel = outputLabel
  }

  return { filters, extraInputArgs, outputLabel: currentLabel, nextInputIndex: inputCount }
}

// ---------------------------------------------------------------------------
// Frame overlay orchestration (standalone, uses buildFrameFilters internally)
// ---------------------------------------------------------------------------

export interface FrameOverlayOptions {
  chrome?: WindowChromeOptions
  background?: BackgroundOptions
  videoWidth: number
  videoHeight: number
  outputPath?: string
  screenshots?: string[]
}

/**
 * Apply window chrome, rounded corners, and background to a video.
 *
 * Renders static PNGs via Playwright, delegates filter construction to
 * buildFrameFilters, then runs a single FFmpeg invocation.
 */
export async function applyFrameOverlay(
  videoPath: string,
  options: FrameOverlayOptions,
): Promise<string> {
  const { chrome, background, videoWidth, videoHeight, screenshots } = options
  const hasChrome = !!chrome
  const hasBackground = !!background

  if (!hasChrome && !hasBackground) return videoPath

  const ext = path.extname(videoPath)
  const base = path.basename(videoPath, ext)
  const outputDir = path.dirname(videoPath)
  const outputPath = options.outputPath ?? path.join(outputDir, `${base}-framed${ext}`)
  const tempFiles: string[] = []

  // Chrome defaults
  const titleBarHeight = chrome?.titleBarHeight ?? 38
  const titleBarColor = chrome?.titleBarColor ?? '#e8e8e8'
  const trafficLights = chrome?.trafficLights ?? true

  // Background defaults
  const bgColor = background?.color ?? '#6366f1'
  const bgGradient = background?.gradient
  const padding = background?.padding ?? 60
  const borderRadius = background?.borderRadius ?? 10

  // Compute framed video dimensions (before background padding)
  const framedW = videoWidth
  const framedH = videoHeight + (hasChrome ? titleBarHeight : 0)

  // Final output dimensions (with background padding)
  const finalW = hasBackground ? framedW + padding * 2 : framedW
  const finalH = hasBackground ? framedH + padding * 2 : framedH

  // Launch a browser for rendering chrome PNGs
  const browser = await chromium.launch({ headless: true })

  try {
    // Render required PNGs
    let framePngPath: string | undefined
    let bgPngPath: string | undefined
    let maskPngPath: string | undefined

    if (hasChrome) {
      const urlText = typeof chrome?.url === 'string' ? chrome.url : undefined
      framePngPath = await renderWindowFrame({
        width: framedW,
        height: framedH,
        titleBarHeight,
        titleBarColor,
        trafficLights,
        borderRadius: hasBackground ? borderRadius : 0,
        urlText,
      }, browser)
      tempFiles.push(framePngPath)
    }

    if (hasBackground) {
      bgPngPath = await renderBackground({
        totalWidth: finalW,
        totalHeight: finalH,
        windowWidth: framedW,
        windowHeight: framedH,
        padding,
        borderRadius,
        background: bgGradient
          ? { type: 'gradient', from: bgGradient.from, to: bgGradient.to }
          : { type: 'solid', color: bgColor },
      }, browser)
      tempFiles.push(bgPngPath)

      if (borderRadius > 0) {
        maskPngPath = await renderRoundedMask({
          width: framedW,
          height: framedH,
          borderRadius,
        }, browser)
        tempFiles.push(maskPngPath)
      }
    }

    // Build filters via the pure function
    const { filters, extraInputArgs, outputLabel } = buildFrameFilters({
      inputLabel: '0:v',
      inputIndexStart: 1,
      chrome, background, videoWidth, videoHeight,
      framePngPath, bgPngPath, maskPngPath,
    })

    const inputArgs = ['-i', videoPath, ...extraInputArgs]

    // Write filter graph to a script file
    const filterGraph = filters.join(';\n')
    const filterScriptPath = path.join(os.tmpdir(), `fipplet-fg-${Date.now()}.txt`)
    fs.writeFileSync(filterScriptPath, filterGraph)
    tempFiles.push(filterScriptPath)

    await runFFmpeg([
      ...inputArgs,
      '-filter_complex_script', filterScriptPath,
      '-map', `[${outputLabel}]`,
      '-map', '0:a?',
      '-c:v', 'libvpx-vp9',
      ...VP9_FAST_FLAGS,
      '-c:a', 'copy',
      '-y', outputPath,
    ])

    // --- Composite screenshots with the same frame + background ---
    if (screenshots && screenshots.length > 0 && framePngPath && bgPngPath) {
      for (const ssPath of screenshots) {
        if (!fs.existsSync(ssPath)) continue
        await compositeScreenshot({
          screenshotPath: ssPath,
          framePngPath,
          bgPngPath,
          totalWidth: finalW,
          totalHeight: finalH,
          padding,
          titleBarHeight,
          borderRadius,
        }, browser)
      }
    }
  } finally {
    await browser.close()
    for (const f of tempFiles) {
      try { fs.unlinkSync(f) } catch {}
    }
  }

  return outputPath
}
