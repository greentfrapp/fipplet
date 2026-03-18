import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  blendPixel,
  darken,
  encodePng,
  lerp,
  lighten,
  measureText,
  parseHexColor,
  renderText,
  setPixel,
} from './drawing'

export interface WindowFrameConfig {
  width: number
  height: number      // full chromed video height (video + titleBar)
  titleBarHeight: number
  titleBarColor: string
  trafficLights: boolean
  borderRadius: number
  /** URL text to display in the address bar. */
  urlText?: string
}

/**
 * Generate a full window frame overlay PNG.
 *
 * Renders:
 * - Title bar with subtle vertical gradient
 * - Traffic light buttons with borders and inner highlights
 * - Browser-style address bar with URL and lock icon (if urlText provided)
 * - 1px bottom separator below the title bar
 * - 1px inset border around the entire window
 * - Content area is transparent (video shows through)
 */
export function generateWindowFramePng(config: WindowFrameConfig): string {
  const { width, height, titleBarHeight, titleBarColor, trafficLights, borderRadius } = config
  const rgbaData = Buffer.alloc(width * height * 4) // transparent

  const baseColor = parseHexColor(titleBarColor)
  const topColor = lighten(baseColor, 0.06)
  const bottomColor = darken(baseColor, 0.04)
  const separatorColor = darken(baseColor, 0.15)
  const borderColor = darken(baseColor, 0.22)

  // --- Title bar gradient fill ---
  for (let y = 0; y < titleBarHeight; y++) {
    const t = y / (titleBarHeight - 1)
    const r = Math.round(lerp(topColor.r, bottomColor.r, t))
    const g = Math.round(lerp(topColor.g, bottomColor.g, t))
    const b = Math.round(lerp(topColor.b, bottomColor.b, t))
    for (let x = 0; x < width; x++) {
      setPixel(rgbaData, width, x, y, r, g, b, 255)
    }
  }

  // --- Bottom separator line ---
  for (let x = 0; x < width; x++) {
    setPixel(rgbaData, width, x, titleBarHeight - 1, separatorColor.r, separatorColor.g, separatorColor.b, 255)
  }

  // --- 1px inset border (left, right, bottom edges of content area) ---
  for (let y = titleBarHeight; y < height; y++) {
    setPixel(rgbaData, width, 0, y, borderColor.r, borderColor.g, borderColor.b, 255)
    setPixel(rgbaData, width, width - 1, y, borderColor.r, borderColor.g, borderColor.b, 255)
  }
  for (let x = 0; x < width; x++) {
    setPixel(rgbaData, width, x, height - 1, borderColor.r, borderColor.g, borderColor.b, 255)
  }
  // Top and side borders of title bar
  for (let x = 0; x < width; x++) {
    setPixel(rgbaData, width, x, 0, borderColor.r, borderColor.g, borderColor.b, 255)
  }
  for (let y = 0; y < titleBarHeight; y++) {
    setPixel(rgbaData, width, 0, y, borderColor.r, borderColor.g, borderColor.b, 255)
    setPixel(rgbaData, width, width - 1, y, borderColor.r, borderColor.g, borderColor.b, 255)
  }

  // --- Mask out corners using the border radius ---
  if (borderRadius > 0) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = Math.max(0, Math.abs(x - width / 2) - (width / 2 - borderRadius))
        const dy = Math.max(0, Math.abs(y - height / 2) - (height / 2 - borderRadius))
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > borderRadius) {
          setPixel(rgbaData, width, x, y, 0, 0, 0, 0)
        }
      }
    }
  }

  // --- Traffic light buttons ---
  if (trafficLights) {
    drawTrafficLights(rgbaData, width, titleBarHeight)
  }

  // --- Address bar (pill-shaped URL field) ---
  if (config.urlText) {
    drawAddressBar(rgbaData, width, titleBarHeight, baseColor, trafficLights, config.urlText)
  }

  const pngBuf = encodePng(width, height, rgbaData)
  const pngPath = path.join(os.tmpdir(), `fipplet-frame-${Date.now()}.png`)
  fs.writeFileSync(pngPath, pngBuf)
  return pngPath
}

// ---------------------------------------------------------------------------
// Traffic light buttons
// ---------------------------------------------------------------------------

function drawTrafficLights(data: Buffer, width: number, titleBarHeight: number) {
  const btnRadius = 6
  const btnGap = 20
  const btnCenterY = Math.floor(titleBarHeight / 2)
  const btnFirstX = 20

  const buttons = [
    { cx: btnFirstX, color: { r: 255, g: 95, b: 87 } },
    { cx: btnFirstX + btnGap, color: { r: 255, g: 189, b: 46 } },
    { cx: btnFirstX + btnGap * 2, color: { r: 39, g: 201, b: 63 } },
  ]

  for (const btn of buttons) {
    const btnBorder = darken(btn.color, 0.25)
    const btnHighlight = lighten(btn.color, 0.3)

    for (let y = btnCenterY - btnRadius - 1; y <= btnCenterY + btnRadius + 1; y++) {
      for (let x = btn.cx - btnRadius - 1; x <= btn.cx + btnRadius + 1; x++) {
        if (x < 0 || x >= width || y < 0 || y >= titleBarHeight) continue
        const dx = x - btn.cx
        const dy = y - btnCenterY
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist <= btnRadius + 0.5) {
          const edgeAlpha = dist > btnRadius - 0.5
            ? Math.max(0, Math.min(255, Math.round(255 * (btnRadius + 0.5 - dist))))
            : 255

          const vertT = (dy + btnRadius) / (btnRadius * 2)
          let r: number, g: number, b: number
          if (vertT < 0.4) {
            const ht = (0.4 - vertT) / 0.4
            r = Math.round(lerp(btn.color.r, btnHighlight.r, ht * 0.5))
            g = Math.round(lerp(btn.color.g, btnHighlight.g, ht * 0.5))
            b = Math.round(lerp(btn.color.b, btnHighlight.b, ht * 0.5))
          } else {
            const dt = (vertT - 0.4) / 0.6
            const darker = darken(btn.color, 0.08)
            r = Math.round(lerp(btn.color.r, darker.r, dt))
            g = Math.round(lerp(btn.color.g, darker.g, dt))
            b = Math.round(lerp(btn.color.b, darker.b, dt))
          }

          if (dist > btnRadius - 1) {
            const borderBlend = Math.min(1, dist - (btnRadius - 1))
            r = Math.round(lerp(r, btnBorder.r, borderBlend))
            g = Math.round(lerp(g, btnBorder.g, borderBlend))
            b = Math.round(lerp(b, btnBorder.b, borderBlend))
          }

          blendPixel(data, width, x, y, r, g, b, edgeAlpha)
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Address bar (pill with URL + lock icon)
// ---------------------------------------------------------------------------

function drawAddressBar(
  data: Buffer,
  width: number,
  titleBarHeight: number,
  baseColor: { r: number; g: number; b: number },
  trafficLights: boolean,
  urlText: string,
) {
  const scale = titleBarHeight >= 36 ? 2 : 1
  const textH = 8 * scale

  // Pill dimensions
  const pillH = textH + 8 * scale
  const pillY = Math.round((titleBarHeight - pillH) / 2)
  const pillR = Math.round(pillH / 2)
  const pillMarginLeft = trafficLights ? 76 : 12
  const pillMarginRight = 12

  const availLeft = pillMarginLeft
  const availRight = width - pillMarginRight
  const availW = availRight - availLeft
  const maxPillW = Math.min(availW, Math.round(width * 0.6))
  const pillW = maxPillW
  const pillX = Math.round(availLeft + (availW - pillW) / 2)

  // Pill colors
  const pillBg = darken(baseColor, 0.07)
  const pillBorder = darken(baseColor, 0.14)

  // Draw the pill background and border
  for (let py = pillY; py < pillY + pillH; py++) {
    for (let px = pillX; px < pillX + pillW; px++) {
      if (px < 0 || px >= width || py < 0 || py >= titleBarHeight) continue
      const halfW = pillW / 2
      const halfH = pillH / 2
      const cx = pillX + halfW
      const cy = pillY + halfH
      const dx = Math.max(0, Math.abs(px - cx) - (halfW - pillR))
      const dy = Math.max(0, Math.abs(py - cy) - (halfH - pillR))
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist <= pillR + 0.5) {
        const edgeAlpha = dist > pillR - 0.5
          ? Math.max(0, Math.min(255, Math.round(255 * (pillR + 0.5 - dist))))
          : 255

        if (dist > pillR - 1.2) {
          const borderBlend = Math.min(1, dist - (pillR - 1.2))
          const r = Math.round(lerp(pillBg.r, pillBorder.r, borderBlend))
          const g = Math.round(lerp(pillBg.g, pillBorder.g, borderBlend))
          const b = Math.round(lerp(pillBg.b, pillBorder.b, borderBlend))
          blendPixel(data, width, px, py, r, g, b, edgeAlpha)
        } else {
          blendPixel(data, width, px, py, pillBg.r, pillBg.g, pillBg.b, edgeAlpha)
        }
      }
    }
  }

  // Lock icon for https URLs
  const isHttps = urlText.startsWith('https')
  const lockW = isHttps ? 10 * scale : 0
  const textPadLeft = 8 * scale + lockW

  if (isHttps) {
    drawLockIcon(data, width, titleBarHeight, baseColor, pillX, pillY, pillH, scale)
  }

  // Render URL text inside the pill
  const textColor = darken(baseColor, 0.50)
  const maxTextW = pillW - textPadLeft - 6 * scale

  let displayUrl = urlText
  const textW = measureText(urlText, scale)
  if (textW > maxTextW) {
    while (displayUrl.length > 3 && measureText(displayUrl + '...', scale) > maxTextW) {
      displayUrl = displayUrl.slice(0, -1)
    }
    displayUrl += '...'
  }

  const displayW = measureText(displayUrl, scale)
  const textX = pillX + textPadLeft
  const textY = pillY + Math.round((pillH - textH) / 2)

  if (textX + displayW <= pillX + pillW - 4 * scale) {
    renderText(data, width, displayUrl, textX, textY, scale, textColor)
  }
}

function drawLockIcon(
  data: Buffer,
  width: number,
  titleBarHeight: number,
  baseColor: { r: number; g: number; b: number },
  pillX: number,
  pillY: number,
  pillH: number,
  scale: number,
) {
  const lockColor = darken(baseColor, 0.40)
  const lockX = pillX + Math.round(6 * scale)
  const lockCy = pillY + Math.round(pillH / 2)
  const bodyW = 5 * scale
  const bodyH = 4 * scale
  const bodyX = lockX
  const bodyY = lockCy - Math.floor(bodyH / 2) + scale

  // Shackle (arc above the body)
  const shackleR = Math.round(1.8 * scale)
  const shackleCx = bodyX + Math.floor(bodyW / 2)
  const shackleCy = bodyY
  for (let py = shackleCy - shackleR - scale; py <= shackleCy; py++) {
    for (let px = shackleCx - shackleR - scale; px <= shackleCx + shackleR + scale; px++) {
      if (px < 0 || px >= width || py < 0 || py >= titleBarHeight) continue
      const dx = px - shackleCx
      const dy = py - shackleCy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dy <= 0 && dist >= shackleR - 0.5 && dist <= shackleR + scale * 0.8) {
        const a = Math.min(255, Math.round(255 * Math.min(1, dist - (shackleR - 0.5)) * Math.min(1, (shackleR + scale * 0.8) - dist)))
        blendPixel(data, width, px, py, lockColor.r, lockColor.g, lockColor.b, a)
      }
    }
  }

  // Lock body (filled rectangle)
  for (let py = bodyY; py < bodyY + bodyH; py++) {
    for (let px = bodyX; px < bodyX + bodyW; px++) {
      if (px < 0 || px >= width || py < 0 || py >= titleBarHeight) continue
      blendPixel(data, width, px, py, lockColor.r, lockColor.g, lockColor.b, 255)
    }
  }
}
