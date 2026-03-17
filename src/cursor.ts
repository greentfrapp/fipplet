import type { Page } from 'playwright-core'
import type { CursorOptions, ZoomState } from './types'
import { suspendZoom, restoreZoom } from './zoom'
// @ts-expect-error -- .svg imported as text via esbuild loader
import CURSOR_SVG from './cursor.svg'

const CURSOR_ID = '__fipplet-cursor'
const RIPPLE_CLASS = '__fipplet-ripple'

interface InjectArgs {
  svg: string
  id: string
  rippleClass: string
  size: number
  transitionMs: number
  /** If set, cursor starts at this position (no transition). */
  restoreX?: number
  restoreY?: number
}

/**
 * Browser-side injector. Idempotent — safe to call repeatedly.
 * If restoreX/restoreY are provided AND the cursor is freshly created,
 * it starts at that position with no transition.
 */
function browserInject({ svg, id, rippleClass, size, transitionMs, restoreX, restoreY }: InjectArgs) {
  if (document.getElementById(id)) return
  const cursor = document.createElement('div')
  cursor.id = id
  cursor.innerHTML = svg

  const hasRestore = restoreX !== undefined && restoreY !== undefined
  const initialTransform = hasRestore
    ? `translate(${restoreX}px, ${restoreY}px)`
    : 'translate(-100px, -100px)'

  cursor.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: 0',
    `width: ${size}px`,
    `height: ${size}px`,
    'pointer-events: none',
    'z-index: 2147483647',
    `transform: ${initialTransform}`,
    `transition: transform ${transitionMs}ms cubic-bezier(0.22, 1, 0.36, 1)`,
    'will-change: transform',
  ].join(';')
  document.documentElement.appendChild(cursor)

  const style = document.createElement('style')
  style.textContent = `
    @keyframes __fipplet-ripple-anim {
      0% { transform: translate(-50%, -50%) scale(0); opacity: 0.5; }
      100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
    }
    .${rippleClass} {
      position: fixed;
      pointer-events: none;
      z-index: 2147483646;
      border-radius: 50%;
      animation: __fipplet-ripple-anim 500ms ease-out forwards;
    }
  `
  ;(document.head ?? document.documentElement).appendChild(style)
}

/** Cached inject args — set once by injectCursor. */
let cachedArgs: InjectArgs | undefined

/** Last known cursor position — preserved across page navigations. */
let lastPos: { x: number; y: number } | undefined

export async function injectCursor(page: Page, options: CursorOptions = {}): Promise<void> {
  cachedArgs = {
    svg: CURSOR_SVG,
    id: CURSOR_ID,
    rippleClass: RIPPLE_CLASS,
    size: options.size ?? 24,
    transitionMs: options.transitionMs ?? 350,
  }
  lastPos = undefined
  await page.evaluate(browserInject, cachedArgs)

  // Re-inject cursor eagerly after any navigation (link clicks, redirects, etc.)
  // so the cursor is present as soon as the new page renders.
  page.on('domcontentloaded', async () => {
    if (!cachedArgs) return
    const args = lastPos
      ? { ...cachedArgs, restoreX: lastPos.x, restoreY: lastPos.y }
      : cachedArgs
    await page.evaluate(browserInject, args).catch(() => {})
  })
}

/** Safety net — re-inject cursor if the domcontentloaded listener missed it. */
async function ensureCursor(page: Page): Promise<void> {
  if (!cachedArgs) return
  const args = lastPos
    ? { ...cachedArgs, restoreX: lastPos.x, restoreY: lastPos.y }
    : cachedArgs
  await page.evaluate(browserInject, args)
}

export async function moveCursorTo(
  page: Page,
  selector: string,
  zoomState: ZoomState,
  options: CursorOptions = {},
): Promise<void> {
  const transitionMs = options.transitionMs ?? 350

  await ensureCursor(page)
  await suspendZoom(page, zoomState)

  const center = await page.evaluate((sel: string) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  }, selector)

  if (!center) {
    await restoreZoom(page, zoomState)
    return
  }

  lastPos = { x: center.x, y: center.y }

  await page.evaluate(
    ({ id, x, y }) => {
      const cursor = document.getElementById(id)
      if (cursor) cursor.style.transform = `translate(${x}px, ${y}px)`
    },
    { id: CURSOR_ID, x: center.x, y: center.y },
  )

  await restoreZoom(page, zoomState)
  await page.waitForTimeout(transitionMs + 50)
}

export async function moveCursorToPoint(
  page: Page,
  x: number,
  y: number,
  options: CursorOptions = {},
): Promise<void> {
  const transitionMs = options.transitionMs ?? 350

  await ensureCursor(page)

  lastPos = { x, y }

  await page.evaluate(
    ({ id, x, y }) => {
      const cursor = document.getElementById(id)
      if (cursor) cursor.style.transform = `translate(${x}px, ${y}px)`
    },
    { id: CURSOR_ID, x, y },
  )

  await page.waitForTimeout(transitionMs + 50)
}

export async function triggerRipple(page: Page, options: CursorOptions = {}): Promise<void> {
  const rippleSize = options.rippleSize ?? 40
  const rippleColor = options.rippleColor ?? 'rgba(59, 130, 246, 0.4)'

  await page.evaluate(
    ({ id, rippleClass, size, color }) => {
      const cursor = document.getElementById(id)
      if (!cursor) return

      const style = cursor.style.transform
      const match = style.match(/translate\(([^,]+)px,\s*([^)]+)px\)/)
      if (!match) return

      const x = parseFloat(match[1])
      const y = parseFloat(match[2])

      const ripple = document.createElement('div')
      ripple.className = rippleClass
      ripple.style.cssText = [
        `left: ${x}px`,
        `top: ${y}px`,
        `width: ${size}px`,
        `height: ${size}px`,
        `background: ${color}`,
      ].join(';')
      document.documentElement.appendChild(ripple)

      ripple.addEventListener('animationend', () => ripple.remove())
    },
    { id: CURSOR_ID, rippleClass: RIPPLE_CLASS, size: rippleSize, color: rippleColor },
  )
}

export async function hideCursor(page: Page): Promise<void> {
  await page.evaluate((id: string) => {
    const cursor = document.getElementById(id)
    if (cursor) cursor.style.display = 'none'
  }, CURSOR_ID)
}

export async function showCursor(page: Page): Promise<void> {
  await page.evaluate((id: string) => {
    const cursor = document.getElementById(id)
    if (cursor) cursor.style.display = ''
  }, CURSOR_ID)
}
