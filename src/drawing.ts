// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

export interface RGB {
  r: number
  g: number
  b: number
}

/** Parse '#RRGGBB' or '#RGB' hex color to { r, g, b }. */
export function parseHexColor(hex: string): RGB {
  let h = hex.replace(/^#/, '')
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

/** Convert '#RRGGBB' or '#RGB' to FFmpeg '0xRRGGBB' format. */
export function hexToFFmpeg(hex: string): string {
  let h = hex.replace(/^#/, '')
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  }
  if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) {
    throw new Error(`Invalid hex color: '${hex}' (expected #RGB or #RRGGBB)`)
  }
  return '0x' + h
}
