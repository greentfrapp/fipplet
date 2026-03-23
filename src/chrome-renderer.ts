import fs from 'fs'
import os from 'os'
import path from 'path'
import type { Browser } from 'playwright-core'
import backgroundHtml from './templates/background.html'
import compositeHtml from './templates/composite.html'
import windowFrameHtml from './templates/window-frame.html'

export interface WindowFrameRenderConfig {
  width: number
  height: number
  titleBarHeight: number
  titleBarColor: string
  trafficLights: boolean
  borderRadius: number
  urlText?: string
}

export interface BackgroundRenderConfig {
  totalWidth: number
  totalHeight: number
  windowWidth: number
  windowHeight: number
  padding: number
  borderRadius: number
  background:
    | { type: 'solid'; color: string }
    | { type: 'gradient'; from: string; to: string }
}

/**
 * Render the window frame (title bar, traffic lights, address bar, border)
 * as HTML/CSS and screenshot it with Playwright. Content area is transparent.
 */
export async function renderWindowFrame(
  config: WindowFrameRenderConfig,
  browser: Browser,
): Promise<string> {
  const {
    width,
    height,
    titleBarHeight,
    titleBarColor,
    trafficLights,
    borderRadius,
    urlText,
  } = config

  const isHttps = urlText?.startsWith('https') ?? false
  const lockSvg = isHttps
    ? `<svg width="10" height="12" viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right:4px;flex-shrink:0;">
        <rect x="1" y="5" width="8" height="6" rx="1.5" fill="currentColor"/>
        <path d="M3 5V3.5a2 2 0 0 1 4 0V5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      </svg>`
    : ''

  const addressBarHtml = urlText
    ? `<div style="
        flex:1;
        max-width:60%;
        margin:0 12px;
        height:${Math.round(titleBarHeight * 0.65)}px;
        background:rgba(0,0,0,0.07);
        border:1px solid rgba(0,0,0,0.1);
        border-radius:999px;
        display:flex;
        align-items:center;
        padding:0 12px;
        color:rgba(0,0,0,0.55);
        font-size:12px;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
        overflow:hidden;
        white-space:nowrap;
      ">
        ${lockSvg}
        <span style="overflow:hidden;text-overflow:ellipsis;">${escapeHtml(urlText)}</span>
      </div>`
    : ''

  const trafficLightsHtml = trafficLights
    ? `<div style="display:flex;align-items:center;gap:8px;margin-left:14px;flex-shrink:0;">
        <div style="width:12px;height:12px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#ff8a80,#ff5f57 60%);box-shadow:inset 0 -1px 2px rgba(0,0,0,0.15),0 0.5px 0.5px rgba(0,0,0,0.1);"></div>
        <div style="width:12px;height:12px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#ffd080,#ffbd2e 60%);box-shadow:inset 0 -1px 2px rgba(0,0,0,0.15),0 0.5px 0.5px rgba(0,0,0,0.1);"></div>
        <div style="width:12px;height:12px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#6aed7e,#27c93f 60%);box-shadow:inset 0 -1px 2px rgba(0,0,0,0.15),0 0.5px 0.5px rgba(0,0,0,0.1);"></div>
      </div>`
    : ''

  const html = windowFrameHtml
    .replaceAll('{{WIDTH}}', String(width))
    .replaceAll('{{HEIGHT}}', String(height))
    .replace('{{TITLE_BAR_HEIGHT}}', String(titleBarHeight))
    .replaceAll('{{TITLE_BAR_COLOR}}', titleBarColor)
    .replaceAll('{{BORDER_RADIUS}}', String(borderRadius))
    .replace('{{TRAFFIC_LIGHTS}}', trafficLightsHtml)
    .replace('{{ADDRESS_BAR}}', addressBarHtml)

  const page = await browser.newPage({ viewport: { width, height } })
  await page.setContent(html, { waitUntil: 'load' })
  const pngPath = path.join(os.tmpdir(), `fipplet-frame-${Date.now()}.png`)
  await page.screenshot({ path: pngPath, omitBackground: true })
  await page.close()
  return pngPath
}

/**
 * Render the background (solid/gradient + drop shadow) as HTML/CSS
 * and screenshot it with Playwright.
 */
export async function renderBackground(
  config: BackgroundRenderConfig,
  browser: Browser,
): Promise<string> {
  const {
    totalWidth,
    totalHeight,
    windowWidth,
    windowHeight,
    padding,
    borderRadius,
    background,
  } = config

  const bgCss =
    background.type === 'gradient'
      ? `linear-gradient(135deg, ${background.from}, ${background.to})`
      : background.color

  const html = backgroundHtml
    .replaceAll('{{TOTAL_WIDTH}}', String(totalWidth))
    .replaceAll('{{TOTAL_HEIGHT}}', String(totalHeight))
    .replace('{{BG_CSS}}', bgCss)
    .replace('{{PADDING}}', String(padding))
    .replace('{{WINDOW_WIDTH}}', String(windowWidth))
    .replace('{{WINDOW_HEIGHT}}', String(windowHeight))
    .replaceAll('{{BORDER_RADIUS}}', String(borderRadius))

  const page = await browser.newPage({
    viewport: { width: totalWidth, height: totalHeight },
  })
  await page.setContent(html, { waitUntil: 'load' })
  const pngPath = path.join(os.tmpdir(), `fipplet-bg-${Date.now()}.png`)
  await page.screenshot({ path: pngPath })
  await page.close()
  return pngPath
}

export interface RoundedMaskConfig {
  width: number
  height: number
  borderRadius: number
}

/**
 * Render a rounded-rectangle mask as a grayscale PNG via Playwright.
 * White = visible, black = masked. Used for alpha-masking rounded corners
 * in FFmpeg instead of the expensive per-pixel `geq` filter.
 */
export async function renderRoundedMask(
  config: RoundedMaskConfig,
  browser: Browser,
): Promise<string> {
  const { width, height, borderRadius } = config

  const html = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; }
  body { width: ${width}px; height: ${height}px; background: black; overflow: hidden; }
  .mask { width: ${width}px; height: ${height}px; border-radius: ${borderRadius}px; background: white; }
</style></head><body><div class="mask"></div></body></html>`

  const page = await browser.newPage({ viewport: { width, height } })
  await page.setContent(html, { waitUntil: 'load' })
  const pngPath = path.join(os.tmpdir(), `fipplet-mask-${Date.now()}.png`)
  await page.screenshot({ path: pngPath })
  await page.close()
  return pngPath
}

export interface CompositeScreenshotConfig {
  screenshotPath: string
  framePngPath: string
  bgPngPath: string
  totalWidth: number
  totalHeight: number
  padding: number
  titleBarHeight: number
  borderRadius: number
}

/**
 * Composite a raw screenshot with the window frame and background PNGs.
 * Renders an HTML page layering background → screenshot → frame, then
 * screenshots the result. Overwrites the original screenshot file.
 */
export async function compositeScreenshot(
  config: CompositeScreenshotConfig,
  browser: Browser,
): Promise<void> {
  const {
    screenshotPath,
    framePngPath,
    bgPngPath,
    totalWidth,
    totalHeight,
    padding,
    titleBarHeight,
    borderRadius,
  } = config

  const toDataUrl = (p: string) =>
    'data:image/png;base64,' + fs.readFileSync(p).toString('base64')

  const html = compositeHtml
    .replaceAll('{{WIDTH}}', String(totalWidth))
    .replaceAll('{{HEIGHT}}', String(totalHeight))
    .replace('{{BG_SRC}}', toDataUrl(bgPngPath))
    .replace('{{SCREENSHOT_SRC}}', toDataUrl(screenshotPath))
    .replace('{{FRAME_SRC}}', toDataUrl(framePngPath))
    .replace('{{CONTENT_X}}', String(padding))
    .replace('{{CONTENT_Y}}', String(padding + titleBarHeight))
    .replace('{{FRAME_X}}', String(padding))
    .replace('{{FRAME_Y}}', String(padding))
    .replaceAll('{{BORDER_RADIUS}}', String(borderRadius))

  const page = await browser.newPage({
    viewport: { width: totalWidth, height: totalHeight },
  })
  await page.setContent(html, { waitUntil: 'load' })
  await page.screenshot({ path: screenshotPath })
  await page.close()
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
