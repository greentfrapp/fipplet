import { describe, expect, it } from 'vitest'
import { createZoomState } from '../zoom'

describe('createZoomState', () => {
  it('returns default zoom state with scale 1 and no translation', () => {
    const state = createZoomState()
    expect(state).toEqual({ scale: 1, tx: 0, ty: 0 })
  })

  it('returns a new object each time', () => {
    const a = createZoomState()
    const b = createZoomState()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})
