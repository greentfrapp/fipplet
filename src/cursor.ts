import type { Page } from 'playwright-core'
import type { CursorEvent, CursorOptions, ZoomState } from './types'
import { suspendZoom, restoreZoom } from './zoom'

/** Collected cursor events during the recording. */
let events: CursorEvent[] = []

/** Recording start time (epoch ms). */
let startTime = 0

/** Reference to the active page (for coordinate queries). */
let activePage: Page | undefined

/** Current cursor position (for ripple placement). */
let cursorPos = { x: 0, y: 0 }

function elapsed(): number {
  return (Date.now() - startTime) / 1000
}

/**
 * Initialize cursor event tracking. Call once at the start of recording.
 * No DOM injection — just records events for post-processing.
 */
export function initCursorTracker(page: Page, _options: CursorOptions = {}): void {
  activePage = page
  startTime = Date.now()
  events = []
  cursorPos = { x: 0, y: 0 }
}

/**
 * Log a cursor move to the center of the given selector.
 * Suspends zoom to get accurate coordinates, then restores it.
 * Waits transitionMs to maintain timing parity with the old DOM approach.
 */
export async function moveCursorTo(
  page: Page,
  selector: string,
  zoomState: ZoomState,
  options: CursorOptions = {},
): Promise<void> {
  const transitionMs = options.transitionMs ?? 350

  await suspendZoom(page, zoomState)

  const center = await page.evaluate((sel: string) => {
    const el = sel.startsWith('//') || sel.startsWith('..')
      ? document.evaluate(sel, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as Element | null
      : document.querySelector(sel)
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  }, selector)

  await restoreZoom(page, zoomState)

  if (!center) return

  cursorPos = { x: center.x, y: center.y }

  events.push({
    time: elapsed(),
    type: 'move',
    x: center.x,
    y: center.y,
    transitionMs,
  })

  // Wait for the transition duration to maintain visual pacing
  await page.waitForTimeout(transitionMs + 50)
}

/**
 * Log a cursor move to an absolute point (no selector lookup).
 */
export async function moveCursorToPoint(
  page: Page,
  x: number,
  y: number,
  options: CursorOptions = {},
): Promise<void> {
  const transitionMs = options.transitionMs ?? 350

  cursorPos = { x, y }

  events.push({
    time: elapsed(),
    type: 'move',
    x,
    y,
    transitionMs,
  })

  await page.waitForTimeout(transitionMs + 50)
}

/**
 * Log a ripple event at the current cursor position.
 */
export async function triggerRipple(_page: Page, options: CursorOptions = {}): Promise<void> {
  events.push({
    time: elapsed(),
    type: 'ripple',
    x: cursorPos.x,
    y: cursorPos.y,
    rippleSize: options.rippleSize ?? 40,
    rippleColor: options.rippleColor ?? 'rgba(59, 130, 246, 0.4)',
  })
}

/**
 * Log a hide event.
 */
export async function hideCursor(_page: Page): Promise<void> {
  events.push({
    time: elapsed(),
    type: 'hide',
    x: cursorPos.x,
    y: cursorPos.y,
  })
}

/**
 * Log a show event.
 */
export async function showCursor(_page: Page): Promise<void> {
  events.push({
    time: elapsed(),
    type: 'show',
    x: cursorPos.x,
    y: cursorPos.y,
  })
}

/**
 * Return all collected cursor events.
 */
export function getCursorEvents(): CursorEvent[] {
  return events
}
