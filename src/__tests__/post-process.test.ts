import { describe, expect, it } from 'vitest'
import { buildFilterGraph, buildPositionExpr, buildVisibilityExpr } from '../post-process'
import type { FilterGraphInput } from '../post-process'
import type { CursorEvent } from '../types'

/**
 * Evaluate an FFmpeg expression by replacing `t` with a value.
 * Supports the subset used by our expressions: if, lt, +, -, *, /
 */
function evalExpr(expr: string, t: number): number {
  // Replace `t` with the actual value (careful not to replace inside function names like `lt`)
  // We replace standalone `t` that's not part of `lt`
  const code = expr
    .replace(/\blt\b/g, '__LT__')
    .replace(/\bt\b/g, String(t))
    .replace(/__LT__/g, 'lt')

  // Provide `if` and `lt` as JavaScript functions
  const fn = new Function('if_', 'lt', `
    function _eval(expr) {
      return expr;
    }
    // FFmpeg if(cond, then, else)
    const __if = if_;
    const __lt = lt;
    return ${code
      .replace(/if\(/g, '__if(')
      .replace(/lt\(/g, '__lt(')};
  `)

  return fn(
    (cond: number, then_: number, else_: number) => cond !== 0 ? then_ : else_,
    (a: number, b: number) => a < b ? 1 : 0,
  )
}

describe('buildPositionExpr', () => {
  it('returns "0" for empty keyframes', () => {
    expect(buildPositionExpr([], 'x')).toBe('0')
  })

  it('returns the value for a single keyframe', () => {
    const expr = buildPositionExpr([{ time: 1, value: 42, transitionMs: 350 }], 'x')
    expect(expr).toBe('42')
  })

  describe('two keyframes', () => {
    const keyframes = [
      { time: 1, value: 100, transitionMs: 400 },
      { time: 3, value: 500, transitionMs: 400 },
    ]
    const expr = buildPositionExpr(keyframes, 'x')

    it('returns first value before any transition', () => {
      expect(evalExpr(expr, 0)).toBe(100)
      expect(evalExpr(expr, 1)).toBe(100)
      expect(evalExpr(expr, 2)).toBe(100)
    })

    it('interpolates during transition', () => {
      // Transition from keyframe[0] to keyframe[1] starts at t=2.6 (3-0.4), ends at t=3
      const midpoint = evalExpr(expr, 2.8) // halfway through the 0.4s transition
      expect(midpoint).toBeGreaterThan(100)
      expect(midpoint).toBeLessThan(500)
      expect(midpoint).toBeCloseTo(300, 0)
    })

    it('returns last value after all transitions', () => {
      expect(evalExpr(expr, 3)).toBe(500)
      expect(evalExpr(expr, 10)).toBe(500)
    })
  })

  describe('three keyframes', () => {
    const keyframes = [
      { time: 1, value: 0, transitionMs: 500 },
      { time: 3, value: 200, transitionMs: 500 },
      { time: 5, value: 100, transitionMs: 500 },
    ]
    const expr = buildPositionExpr(keyframes, 'y')

    it('returns first value before first transition', () => {
      expect(evalExpr(expr, 0)).toBe(0)
    })

    it('reaches second keyframe value', () => {
      expect(evalExpr(expr, 3)).toBe(200)
    })

    it('interpolates toward third keyframe', () => {
      const mid = evalExpr(expr, 4.75)
      expect(mid).toBeGreaterThan(100)
      expect(mid).toBeLessThan(200)
    })

    it('returns last value after all transitions', () => {
      expect(evalExpr(expr, 5)).toBe(100)
      expect(evalExpr(expr, 99)).toBe(100)
    })
  })

  it('clamps transition start to 0 when keyframe is very early', () => {
    const keyframes = [
      { time: 0, value: 50, transitionMs: 300 },
      { time: 0.1, value: 200, transitionMs: 300 },
    ]
    const expr = buildPositionExpr(keyframes, 'x')
    // Should not throw or produce NaN
    expect(evalExpr(expr, 0)).toBe(50)
    expect(evalExpr(expr, 0.1)).toBe(200)
  })
})

describe('buildFilterGraph', () => {
  const baseInput: FilterGraphInput = {
    cursorSize: 48,
    xExpr: '100',
    yExpr: '200',
    visExpr: '1',
    rippleEvents: [],
    rippleConfig: null,
  }

  const defaultRippleConfig = {
    size: 40,
    r: 59,
    g: 130,
    b: 246,
    baseAlpha: 0.4,
    durationMs: 500,
  }

  it('uses cursor directly when at base size (48)', () => {
    const { filterGraph } = buildFilterGraph(baseInput)
    expect(filterGraph).not.toContain('scale=')
    expect(filterGraph).toContain('[1:v]')
    expect(filterGraph).toContain('[final_out]')
  })

  it('adds scale filter when cursor size differs from base', () => {
    const { filterGraph } = buildFilterGraph({ ...baseInput, cursorSize: 24 })
    expect(filterGraph).toContain('[1:v]scale=24:24:flags=lanczos[cursor_scaled]')
    expect(filterGraph).toContain('[cursor_scaled]')
    expect(filterGraph).not.toContain('[1:v]overlay')
  })

  it('produces no extra input args when there are no ripple events', () => {
    const { filterGraph, extraInputArgs } = buildFilterGraph(baseInput)
    expect(extraInputArgs).toEqual([])
    expect(filterGraph).toContain('[final_out]')
    expect(filterGraph).not.toContain('ripple_src')
  })

  it('adds one ripple overlay for a single ripple event', () => {
    const input: FilterGraphInput = {
      ...baseInput,
      rippleEvents: [{ x: 300, y: 400, time: 2.5, rippleSize: 40 }],
      rippleConfig: defaultRippleConfig,
    }
    const { filterGraph, extraInputArgs } = buildFilterGraph(input)
    // Inline lavfi source — no extra input files
    expect(extraInputArgs).toEqual([])
    expect(filterGraph).toContain('[final_out]')
    // Ripple source generated inline
    expect(filterGraph).toContain('[ripple_src]')
    expect(filterGraph).toContain('[rip0]')
  })

  it('chains multiple ripple overlays with intermediate labels', () => {
    const input: FilterGraphInput = {
      ...baseInput,
      rippleEvents: [
        { x: 100, y: 200, time: 1.0, rippleSize: 40 },
        { x: 300, y: 400, time: 3.0, rippleSize: 40 },
        { x: 500, y: 600, time: 5.0, rippleSize: 40 },
      ],
      rippleConfig: defaultRippleConfig,
    }
    const { filterGraph, extraInputArgs } = buildFilterGraph(input)
    // Inline lavfi source — no extra input files
    expect(extraInputArgs).toEqual([])
    expect(filterGraph).toContain('[ripple_0]')
    expect(filterGraph).toContain('[ripple_1]')
    expect(filterGraph).toContain('[final_out]')
    // Should split ripple source into 3 streams
    expect(filterGraph).toContain('split=3')
    expect(filterGraph).toContain('[rip0]')
    expect(filterGraph).toContain('[rip1]')
    expect(filterGraph).toContain('[rip2]')
  })

  it('encodes ripple position and timing correctly', () => {
    const input: FilterGraphInput = {
      ...baseInput,
      rippleEvents: [{ x: 150, y: 250, time: 2.0, rippleSize: 40 }],
      rippleConfig: defaultRippleConfig,
    }
    const { filterGraph } = buildFilterGraph(input)
    // x = 150 - 40 = 110, y = 250 - 40 = 210
    expect(filterGraph).toContain("x='110'")
    expect(filterGraph).toContain("y='210'")
    // enable between t=2.0 and t=2.5
    expect(filterGraph).toContain('2.0000')
    expect(filterGraph).toContain('2.5000')
  })
})

describe('buildVisibilityExpr', () => {
  it('returns "1" when no hide/show events exist', () => {
    expect(buildVisibilityExpr([])).toBe('1')
  })

  it('returns "1" when only move/ripple events exist', () => {
    const events: CursorEvent[] = [
      { time: 1, type: 'move', x: 0, y: 0 },
      { time: 2, type: 'ripple', x: 0, y: 0 },
    ]
    expect(buildVisibilityExpr(events)).toBe('1')
  })

  describe('single hide event', () => {
    const events: CursorEvent[] = [
      { time: 2, type: 'hide', x: 0, y: 0 },
    ]
    const expr = buildVisibilityExpr(events)

    it('is visible before the hide', () => {
      expect(evalExpr(expr, 0)).toBe(1)
      expect(evalExpr(expr, 1.9)).toBe(1)
    })

    it('is hidden after the hide', () => {
      expect(evalExpr(expr, 2)).toBe(0)
      expect(evalExpr(expr, 10)).toBe(0)
    })
  })

  describe('hide then show', () => {
    const events: CursorEvent[] = [
      { time: 1, type: 'move', x: 0, y: 0 },
      { time: 2, type: 'hide', x: 0, y: 0 },
      { time: 4, type: 'show', x: 0, y: 0 },
    ]
    const expr = buildVisibilityExpr(events)

    it('is visible before the hide', () => {
      expect(evalExpr(expr, 0)).toBe(1)
    })

    it('is hidden between hide and show', () => {
      expect(evalExpr(expr, 2)).toBe(0)
      expect(evalExpr(expr, 3)).toBe(0)
    })

    it('is visible after the show', () => {
      expect(evalExpr(expr, 4)).toBe(1)
      expect(evalExpr(expr, 10)).toBe(1)
    })
  })

  describe('multiple hide/show cycles', () => {
    const events: CursorEvent[] = [
      { time: 1, type: 'hide', x: 0, y: 0 },
      { time: 2, type: 'show', x: 0, y: 0 },
      { time: 3, type: 'hide', x: 0, y: 0 },
      { time: 4, type: 'show', x: 0, y: 0 },
    ]
    const expr = buildVisibilityExpr(events)

    it('toggles visibility correctly across cycles', () => {
      expect(evalExpr(expr, 0.5)).toBe(1)  // before first hide
      expect(evalExpr(expr, 1.5)).toBe(0)  // after first hide
      expect(evalExpr(expr, 2.5)).toBe(1)  // after first show
      expect(evalExpr(expr, 3.5)).toBe(0)  // after second hide
      expect(evalExpr(expr, 4.5)).toBe(1)  // after second show
    })
  })
})
