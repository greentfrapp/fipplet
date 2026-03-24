import type { Page } from 'playwright-core'
import type {
  CursorEvent,
  CursorOptions,
  CursorStyle,
  CursorTracker,
  ZoomState,
} from './types'
// suspendZoom/restoreZoom no longer needed in cursor tracking —
// coordinates are computed mathematically from the zoom transform


/**
 * Encapsulated cursor tracker. Each `record()` call creates its own instance,
 * so concurrent recordings don't corrupt each other's state.
 */
export class CursorTrackerImpl implements CursorTracker {
  private events: CursorEvent[] = []
  private startTime = 0
  private cursorPos = { x: 0, y: 0 }
  private scale: number

  constructor(scale: number = 1) {
    this.startTime = Date.now()
    this.scale = scale
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

    // Get element center and cursor style WITHOUT suspending zoom.
    // getBoundingClientRect returns screen coordinates (affected by CSS transform).
    // We reverse the transform to get the true layout coordinates for the cursor overlay.
    const result = await page.evaluate(
      ({ sel, scale, tx, ty }: { sel: string; scale: number; tx: number; ty: number }) => {
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

        // Screen coords (with zoom transform applied)
        const screenX = rect.x + rect.width / 2
        const screenY = rect.y + rect.height / 2

        // Reverse the CSS transform: screen = (layout + tx) * scale
        // So: layout = screen / scale - tx
        const layoutX = scale === 1 ? screenX : screenX / scale - tx
        const layoutY = scale === 1 ? screenY : screenY / scale - ty

        // Detect cursor style from the target element
        let cursorStyle: string = 'default'
        const computed = window.getComputedStyle(el).cursor
        if (computed === 'pointer' || computed === 'text') {
          cursorStyle = computed
        } else if (computed === 'auto' || computed === '' || computed === 'default') {
          const tag = el.tagName.toLowerCase()
          if (
            tag === 'a' || tag === 'button' || tag === 'select' || tag === 'summary' ||
            el.closest('a') || el.closest('button') ||
            el.getAttribute('role') === 'button' ||
            el.getAttribute('role') === 'link'
          ) {
            cursorStyle = 'pointer'
          } else if (tag === 'textarea' || (el as HTMLElement).isContentEditable) {
            cursorStyle = 'text'
          } else if (tag === 'input') {
            const inputType = ((el as HTMLInputElement).type || 'text').toLowerCase()
            const textTypes = ['text', 'search', 'url', 'tel', 'email', 'password', 'number', '']
            cursorStyle = textTypes.includes(inputType) ? 'text' : 'pointer'
          }
        }

        return {
          x: layoutX,
          y: layoutY,
          cursorStyle,
        }
      },
      { sel: selector, scale: zoomState.scale, tx: zoomState.tx, ty: zoomState.ty },
    )

    if (!result) return

    // Scale from CSS pixels to video pixels
    const x = result.x * this.scale
    const y = result.y * this.scale

    this.cursorPos = { x, y }

    this.events.push({
      time: this.elapsed(),
      type: 'move',
      x,
      y,
      transitionMs,
      cursorStyle: result.cursorStyle as CursorStyle,
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

    // Scale from CSS pixels to video pixels
    const sx = x * this.scale
    const sy = y * this.scale

    this.cursorPos = { x: sx, y: sy }

    this.events.push({
      time: this.elapsed(),
      type: 'move',
      x: sx,
      y: sy,
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
      rippleSize: (options.rippleSize ?? 40) * this.scale,
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
   * Log a zoom level change so the cursor scales proportionally.
   */
  setZoom(scale: number, durationMs: number): void {
    this.events.push({
      time: this.elapsed(),
      type: 'zoom',
      x: this.cursorPos.x,
      y: this.cursorPos.y,
      zoomScale: scale,
      zoomDurationMs: durationMs,
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
export function createCursorTracker(scale: number = 1): CursorTrackerImpl {
  return new CursorTrackerImpl(scale)
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
