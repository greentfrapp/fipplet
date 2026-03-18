import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { CursorEvent, CursorStyle } from './types'
import { getCursorPng } from './cursors'

/**
 * Resolve the path to the ffmpeg binary.
 * Uses @ffmpeg-installer/ffmpeg if available, falls back to system ffmpeg.
 */
function getFFmpegPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const installer = require('@ffmpeg-installer/ffmpeg')
    return installer.path
  } catch {
    return 'ffmpeg'
  }
}

function runFFmpeg(args: string[]): Promise<void> {
  const ffmpeg = getFFmpegPath()
  return new Promise((resolve, reject) => {
    execFile(ffmpeg, args, { maxBuffer: 50 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) {
        reject(new Error(`ffmpeg failed: ${err.message}\n${stderr}`))
      } else {
        resolve()
      }
    })
  })
}

/** Base size of bundled cursor PNGs. */
const CURSOR_BASE_SIZE = 48

/**
 * Build FFmpeg piecewise-linear expression for cursor position.
 *
 * Given keyframes [(t0,v0), (t1,v1), ...], produces an expression that:
 * - Before first keyframe: returns first value
 * - Between keyframes: linearly interpolates over transitionMs
 * - After last keyframe: returns last value
 */
export function buildPositionExpr(
  keyframes: Array<{ time: number; value: number; transitionMs: number }>,
  axis: 'x' | 'y',
): string {
  if (keyframes.length === 0) return '0'
  if (keyframes.length === 1) return String(keyframes[0].value)

  // Build nested if/else expression
  // For each segment: if t < arrival_time, interpolate from prev to current
  let expr = String(keyframes[keyframes.length - 1].value)

  for (let i = keyframes.length - 1; i >= 1; i--) {
    const prev = keyframes[i - 1]
    const curr = keyframes[i]
    const durSec = curr.transitionMs / 1000
    const arrivalTime = curr.time // time the move event was logged

    // The cursor starts moving at arrivalTime - durSec and arrives at arrivalTime
    const moveStart = Math.max(0, arrivalTime - durSec)

    // During transition: lerp from prev.value to curr.value
    const lerp = `${prev.value}+(${curr.value}-${prev.value})*(t-${moveStart.toFixed(4)})/${durSec.toFixed(4)}`
    // Before the transition start: use prev value
    expr = `if(lt(t,${moveStart.toFixed(4)}),${prev.value},if(lt(t,${arrivalTime.toFixed(4)}),${lerp},${expr}))`
  }

  return expr
}

/**
 * Build FFmpeg expression for cursor visibility (opacity).
 * Returns '1' when visible, '0' when hidden.
 */
export function buildVisibilityExpr(events: CursorEvent[]): string {
  const visEvents = events.filter((e) => e.type === 'hide' || e.type === 'show')
  if (visEvents.length === 0) return '1'

  // Build nested if-else: before first event → visible (1),
  // between event[i] and event[i+1] → value set by event[i],
  // after last event → value set by last event.
  //
  // Structure: if(t<t0, 1, if(t<t1, val0, if(t<t2, val1, val2)))
  // Build from the innermost (last event) outward.
  const lastVal = visEvents[visEvents.length - 1].type === 'hide' ? '0' : '1'
  let result = lastVal

  for (let i = visEvents.length - 2; i >= 0; i--) {
    const val = visEvents[i].type === 'hide' ? '0' : '1'
    result = `if(lt(t,${visEvents[i + 1].time.toFixed(4)}),${val},${result})`
  }

  // Wrap with the default "visible before first event"
  result = `if(lt(t,${visEvents[0].time.toFixed(4)}),1,${result})`

  return result
}

/**
 * Generate a short transparent ripple animation clip using FFmpeg.
 */
async function generateRippleClip(
  size: number,
  color: string,
  durationMs: number = 500,
): Promise<string> {
  const clipPath = path.join(os.tmpdir(), `fipplet-ripple-${Date.now()}.webm`)

  // Parse rgba color
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/)
  const r = match ? parseInt(match[1]) : 59
  const g = match ? parseInt(match[2]) : 130
  const b = match ? parseInt(match[3]) : 246
  const baseAlpha = match && match[4] ? parseFloat(match[4]) : 0.4
  const fps = 30
  const frames = Math.ceil((durationMs / 1000) * fps)

  // Generate a ripple animation: expanding circle that fades out
  // Using drawbox with animated size and opacity via the geq filter
  await runFFmpeg([
    '-f', 'lavfi',
    '-i', `color=c=black@0:s=${size * 2}x${size * 2}:d=${(durationMs / 1000).toFixed(2)}:r=${fps},format=rgba`,
    '-vf', [
      // Draw expanding circle using the geq filter
      `geq=` +
      `r='if(lte(hypot(X-${size},Y-${size}),${size}*(N+1)/${frames})*gt(hypot(X-${size},Y-${size}),(${size}*(N+1)/${frames})-3),${r},0)'` +
      `:g='if(lte(hypot(X-${size},Y-${size}),${size}*(N+1)/${frames})*gt(hypot(X-${size},Y-${size}),(${size}*(N+1)/${frames})-3),${g},0)'` +
      `:b='if(lte(hypot(X-${size},Y-${size}),${size}*(N+1)/${frames})*gt(hypot(X-${size},Y-${size}),(${size}*(N+1)/${frames})-3),${b},0)'` +
      `:a='if(lte(hypot(X-${size},Y-${size}),${size}*(N+1)/${frames})*gt(hypot(X-${size},Y-${size}),(${size}*(N+1)/${frames})-3),${Math.round(255 * baseAlpha)}*(1-N/${frames}),0)'`,
    ].join(','),
    '-c:v', 'libvpx-vp9',
    '-pix_fmt', 'yuva420p',
    '-auto-alt-ref', '0',
    '-y', clipPath,
  ])

  return clipPath
}

export interface FilterGraphInput {
  cursorSize: number
  xExpr: string
  yExpr: string
  visExpr: string
  rippleEvents: Array<{ x: number; y: number; time: number; rippleSize?: number }>
  rippleClipPath: string | null
  rippleDurationMs: number
}

export interface FilterGraphOutput {
  /** The complete FFmpeg filter_complex graph string */
  filterGraph: string
  /** Additional -i args beyond [-i video, -i cursor] (one per ripple event) */
  extraInputArgs: string[]
}

/**
 * Build the FFmpeg filter_complex graph string for cursor overlay.
 *
 * Pure function — no I/O. The caller is responsible for generating the
 * ripple clip and wiring up the FFmpeg invocation.
 */
export function buildFilterGraph(input: FilterGraphInput): FilterGraphOutput {
  const { cursorSize, xExpr, yExpr, visExpr, rippleEvents, rippleClipPath, rippleDurationMs } = input
  const filters: string[] = []
  let currentInput = '0:v'
  let inputCount = 2 // 0 = video, 1 = cursor image
  const extraInputArgs: string[] = []

  // Scale cursor inline if needed, then overlay on video
  let cursorLabel = '1:v'
  if (cursorSize !== CURSOR_BASE_SIZE) {
    filters.push(`[1:v]scale=${cursorSize}:${cursorSize}:flags=lanczos[cursor_scaled]`)
    cursorLabel = 'cursor_scaled'
  }

  // Overlay cursor on video
  filters.push(
    `[${currentInput}][${cursorLabel}]overlay=x='${xExpr}':y='${yExpr}':enable='${visExpr}':format=auto[cursor_out]`,
  )
  currentInput = 'cursor_out'

  // Add ripple overlays
  if (rippleEvents.length > 0 && rippleClipPath) {
    for (let i = 0; i < rippleEvents.length; i++) {
      const ev = rippleEvents[i]
      const rippleInputIdx = inputCount
      extraInputArgs.push('-i', rippleClipPath)
      inputCount++

      const rippleSize = ev.rippleSize ?? 40
      const ox = Math.round(ev.x - rippleSize)
      const oy = Math.round(ev.y - rippleSize)
      const enableStart = ev.time.toFixed(4)
      const enableEnd = (ev.time + rippleDurationMs / 1000).toFixed(4)
      const nextLabel = i === rippleEvents.length - 1 ? 'final_out' : `ripple_${i}`

      filters.push(
        `[${currentInput}][${rippleInputIdx}:v]overlay=x='${ox}':y='${oy}':enable='between(t\\,${enableStart}\\,${enableEnd})':eof_action=pass:format=auto[${nextLabel}]`,
      )
      currentInput = nextLabel
    }
  } else {
    // Rename cursor_out to final_out
    filters[filters.length - 1] = filters[filters.length - 1].replace('[cursor_out]', '[final_out]')
  }

  return {
    filterGraph: filters.join(';'),
    extraInputArgs,
  }
}

export interface CursorOverlayOptions {
  /** Cursor image style. Default: 'default'. */
  cursorStyle?: CursorStyle
  /** Cursor display size in pixels. Default: 24. */
  cursorSize?: number
  /** Output path. Defaults to replacing the input with a suffixed version. */
  outputPath?: string
}

/**
 * Composite cursor overlay onto a video using FFmpeg.
 *
 * Reads cursor events (move/ripple/hide/show), builds FFmpeg filter expressions
 * that position the cursor image and render ripple effects, then produces a
 * new video file with the cursor baked in.
 */
export async function applyCursorOverlay(
  videoPath: string,
  events: CursorEvent[],
  options: CursorOverlayOptions,
): Promise<string> {
  const outputDir = path.dirname(videoPath)
  const cursorStyle = options.cursorStyle ?? 'default'
  const cursorSize = options.cursorSize ?? 24
  const ext = path.extname(videoPath)
  const base = path.basename(videoPath, ext)
  const outputPath = options.outputPath ?? path.join(outputDir, `${base}-cursor${ext}`)

  // Extract move keyframes for position expressions
  const moveEvents = events.filter((e) => e.type === 'move')
  const keyframes = moveEvents.map((e) => ({
    time: e.time,
    x: e.x,
    y: e.y,
    transitionMs: e.transitionMs ?? 350,
  }))

  const xKeyframes = keyframes.map((k) => ({ time: k.time, value: k.x, transitionMs: k.transitionMs }))
  const yKeyframes = keyframes.map((k) => ({ time: k.time, value: k.y, transitionMs: k.transitionMs }))

  const xExpr = buildPositionExpr(xKeyframes, 'x')
  const yExpr = buildPositionExpr(yKeyframes, 'y')
  const visExpr = buildVisibilityExpr(events)

  // Resolve bundled cursor image path (always base size; scaled inline in filter graph)
  const cursorPng = getCursorPng(cursorStyle)
  const tempFiles: string[] = []

  // Build ripple overlays for each ripple event
  const rippleEvents = events.filter((e) => e.type === 'ripple')

  // Generate ripple clip if needed
  const inputArgs: string[] = ['-i', videoPath, '-i', cursorPng]
  let rippleClipPath: string | null = null
  const rippleDurationMs = 500

  if (rippleEvents.length > 0) {
    const rippleSize = rippleEvents[0].rippleSize ?? 40
    const rippleColor = rippleEvents[0].rippleColor ?? 'rgba(59, 130, 246, 0.4)'
    rippleClipPath = await generateRippleClip(rippleSize, rippleColor, rippleDurationMs)
    tempFiles.push(rippleClipPath)
  }

  // Build filter graph
  const { filterGraph, extraInputArgs } = buildFilterGraph({
    cursorSize,
    xExpr,
    yExpr,
    visExpr,
    rippleEvents,
    rippleClipPath,
    rippleDurationMs,
  })
  inputArgs.push(...extraInputArgs)

  // Write filter graph to a script file to avoid shell/argument escaping issues
  // with complex expressions containing commas and parentheses
  const filterScriptPath = path.join(os.tmpdir(), `fipplet-filter-${Date.now()}.txt`)
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
