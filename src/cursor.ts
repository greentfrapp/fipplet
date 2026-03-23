import type { Page } from 'playwright-core'
import type {
  CursorEvent,
  CursorOptions,
  CursorTracker,
  ZoomState,
} from './types'
import { restoreZoom, suspendZoom } from './zoom'

/**
 * Encapsulated cursor tracker. Each `record()` call creates its own instance,
 * so concurrent recordings don't corrupt each other's state.
 */
export class CursorTrackerImpl implements CursorTracker {
  private events: CursorEvent[] = []
  private startTime = 0
  private cursorPos = { x: 0, y: 0 }

  constructor() {
    this.startTime = Date.now()
  }

  private elapsed(): number {
    return (Date.now() - this.startTime) / 1000
  }

  /**
   * Log a cursor move to the center of the given selector.
   * Suspends zoom to get accurate coordinates, then restores it.
   */
  async moveCursorTo(
    page: Page,
    selector: string,
    zoomState: ZoomState,
    options: CursorOptions = {},
  ): Promise<void> {
    const transitionMs = options.transitionMs ?? 350

    await suspendZoom(page, zoomState)

    const center = await page.evaluate((sel: string) => {
      const el =
        sel.startsWith('//') || sel.startsWith('..')
          ? (document.evaluate(
              sel,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null,
            ).singleNodeValue as Element | null)
          : document.querySelector(sel)
      if (!el) return null
      const rect = el.getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    }, selector)

    await restoreZoom(page, zoomState)

    if (!center) return

    this.cursorPos = { x: center.x, y: center.y }

    this.events.push({
      time: this.elapsed(),
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
  async moveCursorToPoint(
    page: Page,
    x: number,
    y: number,
    options: CursorOptions = {},
  ): Promise<void> {
    const transitionMs = options.transitionMs ?? 350

    this.cursorPos = { x, y }

    this.events.push({
      time: this.elapsed(),
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
  async triggerRipple(_page: Page, options: CursorOptions = {}): Promise<void> {
    this.events.push({
      time: this.elapsed(),
      type: 'ripple',
      x: this.cursorPos.x,
      y: this.cursorPos.y,
      rippleSize: options.rippleSize ?? 40,
      rippleColor: options.rippleColor ?? 'rgba(59, 130, 246, 0.4)',
    })
  }

  /**
   * Log a hide event.
   */
  async hideCursor(_page: Page): Promise<void> {
    this.events.push({
      time: this.elapsed(),
      type: 'hide',
      x: this.cursorPos.x,
      y: this.cursorPos.y,
    })
  }

  /**
   * Log a show event.
   */
  async showCursor(_page: Page): Promise<void> {
    this.events.push({
      time: this.elapsed(),
      type: 'show',
      x: this.cursorPos.x,
      y: this.cursorPos.y,
    })
  }

  /**
   * Return all collected cursor events.
   */
  getEvents(): CursorEvent[] {
    return this.events
  }
}

/** Create a new cursor tracker instance. */
export function createCursorTracker(): CursorTrackerImpl {
  return new CursorTrackerImpl()
}

// ---------------------------------------------------------------------------
// Legacy free-function API (delegates to a module-level default instance)
// ---------------------------------------------------------------------------

let defaultTracker = new CursorTrackerImpl()

export function initCursorTracker(
  _page: Page,
  _options: CursorOptions = {},
): void {
  defaultTracker = new CursorTrackerImpl()
}

export async function moveCursorTo(
  page: Page,
  selector: string,
  zoomState: ZoomState,
  options: CursorOptions = {},
): Promise<void> {
  return defaultTracker.moveCursorTo(page, selector, zoomState, options)
}

export async function moveCursorToPoint(
  page: Page,
  x: number,
  y: number,
  options: CursorOptions = {},
): Promise<void> {
  return defaultTracker.moveCursorToPoint(page, x, y, options)
}

export async function triggerRipple(
  page: Page,
  options: CursorOptions = {},
): Promise<void> {
  return defaultTracker.triggerRipple(page, options)
}

export async function hideCursor(page: Page): Promise<void> {
  return defaultTracker.hideCursor(page)
}

export async function showCursor(page: Page): Promise<void> {
  return defaultTracker.showCursor(page)
}

export function getCursorEvents(): CursorEvent[] {
  return defaultTracker.getEvents()
}
