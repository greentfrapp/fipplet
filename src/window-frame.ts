import fs from 'fs'
import os from 'os'
import path from 'path'
import { chromium } from 'playwright-core'
import type { WindowChromeOptions, BackgroundOptions } from './types'
import { hexToFFmpeg } from './drawing'
import { renderWindowFrame, renderBackground, compositeScreenshot } from './chrome-renderer'
import { runFFmpeg } from './post-process'

// ---------------------------------------------------------------------------
// Frame overlay orchestration
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
 * Renders two static PNGs via Playwright (window frame overlay + background
 * with shadow), then builds an FFmpeg filter graph that:
 * 1. Pads the video for the title bar
 * 2. Overlays the window frame (title bar, traffic lights, border)
 * 3. Rounds corners via alpha masking
 * 4. Composites onto the background (with pre-rendered shadow)
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
    const inputArgs: string[] = ['-i', videoPath]
    const filters: string[] = []
    let currentLabel = '0:v'
    let inputCount = 1

    // --- Step 1: Title bar + frame overlay ---
    if (hasChrome) {
      filters.push(
        `[${currentLabel}]pad=iw:ih+${titleBarHeight}:0:${titleBarHeight}:${hexToFFmpeg(titleBarColor)}[padded]`,
      )
      currentLabel = 'padded'

      const urlText = typeof chrome?.url === 'string' ? chrome.url : undefined
      const framePng = await renderWindowFrame({
        width: framedW,
        height: framedH,
        titleBarHeight,
        titleBarColor,
        trafficLights,
        borderRadius: hasBackground ? borderRadius : 0,
        urlText,
      }, browser)
      tempFiles.push(framePng)
      inputArgs.push('-i', framePng)
      const frameInputIdx = inputCount++

      filters.push(
        `[${currentLabel}][${frameInputIdx}:v]overlay=0:0:format=auto[chromed]`,
      )
      currentLabel = 'chromed'
    }

    // --- Step 2: Rounded corners + background ---
    if (hasBackground) {
      const bgPng = await renderBackground({
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
      tempFiles.push(bgPng)
      inputArgs.push('-loop', '1', '-i', bgPng)
      const bgInputIdx = inputCount++

      if (borderRadius > 0) {
        const R = borderRadius
        const alphaExpr =
          `if(lte(hypot(max(0\\,abs(X-W/2)-(W/2-${R}))\\,max(0\\,abs(Y-H/2)-(H/2-${R})))\\,${R})\\,255\\,0)`
        filters.push(
          `[${currentLabel}]format=yuva420p,geq=lum='lum(X\\,Y)':cb='cb(X\\,Y)':cr='cr(X\\,Y)':a='${alphaExpr}'[rounded]`,
        )
        currentLabel = 'rounded'
      }

      filters.push(
        `[${bgInputIdx}:v][${currentLabel}]overlay=${padding}:${padding}:shortest=1:format=auto[final_out]`,
      )
      currentLabel = 'final_out'
    } else {
      const lastFilter = filters[filters.length - 1]
      filters[filters.length - 1] = lastFilter.replace(
        /\[[^\]]+\]$/,
        '[final_out]',
      )
      currentLabel = 'final_out'
    }

    // Write filter graph to a script file
    const filterGraph = filters.join(';\n')
    const filterScriptPath = path.join(os.tmpdir(), `fipplet-fg-${Date.now()}.txt`)
    fs.writeFileSync(filterScriptPath, filterGraph)
    tempFiles.push(filterScriptPath)

    await runFFmpeg([
      ...inputArgs,
      '-filter_complex_script', filterScriptPath,
      '-map', '[final_out]',
      '-map', '0:a?',
      '-c:v', 'libvpx-vp9',
      '-c:a', 'copy',
      '-y', outputPath,
    ])

    // --- Composite screenshots with the same frame + background ---
    if (screenshots && screenshots.length > 0) {
      // We need the frame and background PNGs. They were already rendered
      // above for the video, but we need references to them. Re-render if
      // only one of chrome/background was active, since not all paths set both.
      let framePng: string | undefined
      let bgPng: string | undefined

      if (hasChrome) {
        const urlText = typeof chrome?.url === 'string' ? chrome.url : undefined
        framePng = await renderWindowFrame({
          width: framedW,
          height: framedH,
          titleBarHeight,
          titleBarColor,
          trafficLights,
          borderRadius: hasBackground ? borderRadius : 0,
          urlText,
        }, browser)
        tempFiles.push(framePng)
      }

      if (hasBackground) {
        bgPng = await renderBackground({
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
        tempFiles.push(bgPng)
      }

      if (framePng && bgPng) {
        for (const ssPath of screenshots) {
          if (!fs.existsSync(ssPath)) continue
          await compositeScreenshot({
            screenshotPath: ssPath,
            framePngPath: framePng,
            bgPngPath: bgPng,
            totalWidth: finalW,
            totalHeight: finalH,
            padding,
            titleBarHeight,
            borderRadius,
          }, browser)
        }
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
