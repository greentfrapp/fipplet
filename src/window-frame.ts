import fs from 'fs'
import os from 'os'
import path from 'path'
import type { BackgroundOptions, WindowChromeOptions } from './types'
import { encodePng, hexToFFmpeg, parseHexColor } from './drawing'
import { generateWindowFramePng } from './title-bar'
import { runFFmpeg } from './post-process'

// ---------------------------------------------------------------------------
// Background PNG generator (with optional drop shadow)
// ---------------------------------------------------------------------------

type BgSpec =
  | { type: 'solid'; color: string }
  | { type: 'gradient'; from: string; to: string }

interface ShadowConfig {
  windowW: number
  windowH: number
  padding: number
  borderRadius: number
}

/** Generate a background PNG with optional pre-rendered window shadow. */
function generateBackgroundPng(
  width: number,
  height: number,
  spec: BgSpec,
  shadow?: ShadowConfig,
): string {
  const rgbaData = Buffer.alloc(width * height * 4)

  // Fill background
  if (spec.type === 'solid') {
    const c = parseHexColor(spec.color)
    for (let i = 0; i < width * height; i++) {
      rgbaData[i * 4] = c.r
      rgbaData[i * 4 + 1] = c.g
      rgbaData[i * 4 + 2] = c.b
      rgbaData[i * 4 + 3] = 255
    }
  } else {
    const c1 = parseHexColor(spec.from)
    const c2 = parseHexColor(spec.to)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const t = (x / width + y / height) / 2
        const i = (y * width + x) * 4
        rgbaData[i] = Math.round(c1.r + (c2.r - c1.r) * t)
        rgbaData[i + 1] = Math.round(c1.g + (c2.g - c1.g) * t)
        rgbaData[i + 2] = Math.round(c1.b + (c2.b - c1.b) * t)
        rgbaData[i + 3] = 255
      }
    }
  }

  // Render drop shadow
  if (shadow) {
    const { windowW, windowH, padding, borderRadius } = shadow
    const sigma = 10
    const maxAlpha = 0.35
    const spread = sigma * 3
    const winLeft = padding
    const winTop = padding
    const halfW = windowW / 2
    const halfH = windowH / 2
    const winCx = winLeft + halfW
    const winCy = winTop + halfH
    const R = borderRadius

    for (let y = Math.max(0, winTop - spread); y < Math.min(height, winTop + windowH + spread); y++) {
      for (let x = Math.max(0, winLeft - spread); x < Math.min(width, winLeft + windowW + spread); x++) {
        const dx = Math.max(0, Math.abs(x - winCx) - (halfW - R))
        const dy = Math.max(0, Math.abs(y - winCy) - (halfH - R))
        const dist = Math.sqrt(dx * dx + dy * dy) - R

        if (dist > 0 && dist < spread) {
          const shadowAlpha = maxAlpha * Math.exp(-(dist * dist) / (2 * sigma * sigma))
          const i = (y * width + x) * 4
          rgbaData[i] = Math.round(rgbaData[i] * (1 - shadowAlpha))
          rgbaData[i + 1] = Math.round(rgbaData[i + 1] * (1 - shadowAlpha))
          rgbaData[i + 2] = Math.round(rgbaData[i + 2] * (1 - shadowAlpha))
        }
      }
    }
  }

  const pngBuf = encodePng(width, height, rgbaData)
  const pngPath = path.join(os.tmpdir(), `fipplet-bg-${Date.now()}.png`)
  fs.writeFileSync(pngPath, pngBuf)
  return pngPath
}

// ---------------------------------------------------------------------------
// Frame overlay orchestration
// ---------------------------------------------------------------------------

export interface FrameOverlayOptions {
  chrome?: WindowChromeOptions
  background?: BackgroundOptions
  videoWidth: number
  videoHeight: number
  outputPath?: string
}

/**
 * Apply window chrome, rounded corners, and background to a video.
 *
 * Generates two static PNGs (window frame overlay + background with shadow),
 * then builds an FFmpeg filter graph that:
 * 1. Pads the video for the title bar
 * 2. Overlays the window frame (title bar, traffic lights, border)
 * 3. Rounds corners via alpha masking
 * 4. Composites onto the background (with pre-rendered shadow)
 */
export async function applyFrameOverlay(
  videoPath: string,
  options: FrameOverlayOptions,
): Promise<string> {
  const { chrome, background, videoWidth, videoHeight } = options
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
    const framePng = generateWindowFramePng({
      width: framedW,
      height: framedH,
      titleBarHeight,
      titleBarColor,
      trafficLights,
      borderRadius: hasBackground ? borderRadius : 0,
      urlText,
    })
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
    const bgPng = generateBackgroundPng(
      finalW, finalH,
      bgGradient
        ? { type: 'gradient', from: bgGradient.from, to: bgGradient.to }
        : { type: 'solid', color: bgColor },
      { windowW: framedW, windowH: framedH, padding, borderRadius },
    )
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

  try {
    await runFFmpeg([
      ...inputArgs,
      '-filter_complex_script', filterScriptPath,
      '-map', '[final_out]',
      '-map', '0:a?',
      '-c:v', 'libvpx-vp9',
      '-c:a', 'copy',
      '-y', outputPath,
    ])
  } finally {
    for (const f of tempFiles) {
      try { fs.unlinkSync(f) } catch {}
    }
  }

  return outputPath
}
