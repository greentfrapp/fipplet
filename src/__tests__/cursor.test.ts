import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  initCursorTracker,
  getCursorEvents,
  moveCursorTo,
  moveCursorToPoint,
  triggerRipple,
  hideCursor,
  showCursor,
} from '../cursor'
import type { ZoomState } from '../types'

/** Minimal Page mock — only the methods cursor.ts actually calls. */
function mockPage(elementCenter: { x: number; y: number } | null = { x: 100, y: 200 }) {
  return {
    evaluate: vi.fn().mockResolvedValue(elementCenter),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
  } as any
}

function zoomState(): ZoomState {
  return { scale: 1, tx: 0, ty: 0 }
}

describe('cursor event tracker', () => {
  beforeEach(() => {
    initCursorTracker(mockPage(), {})
  })

  it('starts with an empty event log', () => {
    expect(getCursorEvents()).toEqual([])
  })

  describe('moveCursorTo', () => {
    it('logs a move event with element center coordinates', async () => {
      const page = mockPage({ x: 300, y: 150 })
      await moveCursorTo(page, '#btn', zoomState(), { transitionMs: 200 })

      const events = getCursorEvents()
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('move')
      expect(events[0].x).toBe(300)
      expect(events[0].y).toBe(150)
      expect(events[0].transitionMs).toBe(200)
    })

    it('uses default transitionMs of 350', async () => {
      const page = mockPage({ x: 50, y: 50 })
      await moveCursorTo(page, '#el', zoomState())

      expect(getCursorEvents()[0].transitionMs).toBe(350)
    })

    it('does not log an event when element is not found', async () => {
      const page = mockPage(null)
      await moveCursorTo(page, '#missing', zoomState())

      expect(getCursorEvents()).toHaveLength(0)
    })

    it('waits for transitionMs + 50ms after logging', async () => {
      const page = mockPage({ x: 10, y: 20 })
      await moveCursorTo(page, '#el', zoomState(), { transitionMs: 400 })

      expect(page.waitForTimeout).toHaveBeenCalledWith(450)
    })
  })

  describe('moveCursorToPoint', () => {
    it('logs a move event at the given coordinates', async () => {
      const page = mockPage()
      await moveCursorToPoint(page, 500, 600, { transitionMs: 100 })

      const events = getCursorEvents()
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ type: 'move', x: 500, y: 600, transitionMs: 100 })
    })
  })

  describe('triggerRipple', () => {
    it('logs a ripple event at current cursor position', async () => {
      const page = mockPage({ x: 200, y: 300 })
      await moveCursorTo(page, '#btn', zoomState())
      await triggerRipple(page, { rippleSize: 60, rippleColor: 'red' })

      const events = getCursorEvents()
      expect(events).toHaveLength(2)
      expect(events[1]).toMatchObject({
        type: 'ripple',
        x: 200,
        y: 300,
        rippleSize: 60,
        rippleColor: 'red',
      })
    })

    it('uses default ripple options', async () => {
      const page = mockPage()
      await triggerRipple(page)

      const ev = getCursorEvents()[0]
      expect(ev.rippleSize).toBe(40)
      expect(ev.rippleColor).toBe('rgba(59, 130, 246, 0.4)')
    })
  })

  describe('hideCursor / showCursor', () => {
    it('logs hide and show events', async () => {
      const page = mockPage()
      await hideCursor(page)
      await showCursor(page)

      const events = getCursorEvents()
      expect(events).toHaveLength(2)
      expect(events[0].type).toBe('hide')
      expect(events[1].type).toBe('show')
    })
  })

  describe('event timestamps', () => {
    it('records increasing timestamps', async () => {
      const page = mockPage({ x: 0, y: 0 })
      await moveCursorTo(page, '#a', zoomState())
      await triggerRipple(page)
      await hideCursor(page)

      const events = getCursorEvents()
      expect(events).toHaveLength(3)
      for (let i = 1; i < events.length; i++) {
        expect(events[i].time).toBeGreaterThanOrEqual(events[i - 1].time)
      }
    })

    it('timestamps are in seconds', async () => {
      const page = mockPage({ x: 0, y: 0 })
      await moveCursorTo(page, '#a', zoomState())

      // The event should have been logged within a few ms of initCursorTracker
      const events = getCursorEvents()
      expect(events[0].time).toBeGreaterThanOrEqual(0)
      expect(events[0].time).toBeLessThan(5) // sanity check: < 5 seconds
    })
  })

  describe('initCursorTracker resets state', () => {
    it('clears events from a previous session', async () => {
      const page = mockPage({ x: 0, y: 0 })
      await moveCursorTo(page, '#a', zoomState())
      expect(getCursorEvents()).toHaveLength(1)

      initCursorTracker(page, {})
      expect(getCursorEvents()).toHaveLength(0)
    })
  })
})
